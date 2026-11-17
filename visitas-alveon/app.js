/* Visitas Alveon – registro de visitas a médicos (oxigenoterapia).
   Los datos se guardan en el dispositivo y, opcionalmente, se sincronizan con Google Drive. */
'use strict';

const STORAGE_KEY = 'alveon-visitas-v1';
const LOCAL_KEY = 'alveon-local-v1'; // ajustes propios de cada dispositivo (no se sincronizan)
const ESPECIALIDADES = ['Neumonología', 'Clínica médica', 'Cardiología', 'Geriatría',
  'Medicina familiar', 'Pediatría', 'Terapia intensiva', 'Cuidados paliativos', 'Kinesiología'];
const PROVINCIAS = ['Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes',
  'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén',
  'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero',
  'Tierra del Fuego', 'Tucumán'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* ---------- Almacenamiento ---------- */
const ahora = () => new Date().toISOString();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function leer(clave) {
  try { return JSON.parse(localStorage.getItem(clave)); } catch (_) { return null; }
}
function escribir(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch (_) { return false; }
}

function normalizar(d) {
  const base = { medicos: [], config: { representante: '', frecuenciaDias: 30, actualizado: '' } };
  if (!d || !Array.isArray(d.medicos)) return base;
  d.config = { ...base.config, ...(d.config || {}) };
  d.medicos.forEach(m => {
    // Migración de la versión anterior: "ubicacion" pasa a "direccion".
    if (m.ubicacion !== undefined && m.direccion === undefined) { m.direccion = m.ubicacion; delete m.ubicacion; }
    m.direccion = m.direccion || ''; m.ciudad = m.ciudad || ''; m.provincia = m.provincia || '';
    m.proximaVisita = m.proximaVisita || '';
    m.visitas = (m.visitas || []).map(v => ({ ...v, id: v.id || uid() }));
    m.actualizado = m.actualizado || m.creado || '';
  });
  return d;
}

let db = normalizar(leer(STORAGE_KEY));
let local = { clientId: '', driveConectado: false, ultimaSync: '', ultimoRespaldo: '', pendiente: false, ...(leer(LOCAL_KEY) || {}) };
const guardarLocal = () => escribir(LOCAL_KEY, local);

function save() {
  if (!escribir(STORAGE_KEY, db)) toast('No se pudo guardar en este dispositivo.');
  if (local.driveConectado) { local.pendiente = true; guardarLocal(); programarSync(); }
  pintarNube();
}

const activos = () => db.medicos.filter(m => !m.borrado);
const findMedico = id => db.medicos.find(m => m.id === id && !m.borrado);
const tocar = m => (m.actualizado = ahora());

/* Combina dos copias de los datos (de distintos dispositivos).
   Por médico gana la versión modificada más recientemente; las visitas se unen. */
function combinar(a, b) {
  a = normalizar(JSON.parse(JSON.stringify(a)));
  b = normalizar(JSON.parse(JSON.stringify(b)));
  const mapa = new Map();
  for (const m of [...a.medicos, ...b.medicos]) {
    const prev = mapa.get(m.id);
    if (!prev) { mapa.set(m.id, m); continue; }
    const [nuevo, viejo] = (m.actualizado || '') >= (prev.actualizado || '') ? [m, prev] : [prev, m];
    const visitas = new Map();
    [...viejo.visitas, ...nuevo.visitas].forEach(v => visitas.set(v.id, v));
    mapa.set(m.id, { ...nuevo, visitas: [...visitas.values()] });
  }
  const config = (a.config.actualizado || '') >= (b.config.actualizado || '') ? a.config : b.config;
  return { medicos: [...mapa.values()], config };
}

/* ---------- Cálculos ---------- */
const ordenVisitas = m => [...m.visitas].sort((x, y) => y.fecha.localeCompare(x.fecha));
const ultimaVisita = m => (ordenVisitas(m)[0] || {}).fecha || '';
// El total vigente es el informado en la visita más reciente.
const pacientesTotal = m => Number((ordenVisitas(m)[0] || {}).pacientes) || 0;
const ubicacionTexto = m => [m.direccion, m.ciudad, m.provincia].filter(Boolean).join(', ');

/* ---------- Utilidades ---------- */
const $ = sel => document.querySelector(sel);
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoy = () => iso(new Date());
function sumarDias(f, n) {
  const [y, m, d] = f.split('-').map(Number);
  return iso(new Date(y, m - 1, d + n));
}
const fmtFecha = f => (f ? f.split('-').reverse().join('/') : '—');
function diasEntre(desde, hasta) {
  const p = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  return Math.round((p(hasta) - p(desde)) / 86400000);
}
const soloDigitos = s => String(s || '').replace(/\D/g, '');
const unicos = arr => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
const frecuencia = () => Number(db.config.frecuenciaDias) || 30;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3000);
}
function setHeader(title, back) {
  $('#title').textContent = title;
  $('#btn-back').hidden = !back;
  $('#btn-back').onclick = back || null;
  window.scrollTo(0, 0);
}

/* Estado de visita: según la próxima visita programada o, si no hay, según la frecuencia. */
function estadoVisita(m) {
  const h = hoy();
  if (m.proximaVisita) {
    const d = diasEntre(h, m.proximaVisita);
    if (d < 0) return { cls: 'late', txt: `Visita vencida (${fmtFecha(m.proximaVisita)})`, orden: d };
    if (d === 0) return { cls: 'warn', txt: 'Visitar hoy', orden: 0 };
    if (d <= 3) return { cls: 'warn', txt: `Próxima: ${fmtFecha(m.proximaVisita)}`, orden: d };
    return { cls: '', txt: `Próxima: ${fmtFecha(m.proximaVisita)}`, orden: d };
  }
  const uv = ultimaVisita(m);
  if (!uv) return { cls: 'late', txt: 'Sin visitas', orden: -9999 };
  const desde = diasEntre(uv, h);
  const restante = frecuencia() - desde;
  return { cls: restante <= 0 ? 'late' : restante <= 3 ? 'warn' : '', txt: `Última visita hace ${desde} d`, orden: restante };
}

/* ---------- Pantalla principal ---------- */
let estadoHome = { filtro: '', orden: 'proxima' };

function renderHome() {
  setHeader('Visitas a médicos', null);
  const q = estadoHome.filtro.trim().toLowerCase();
  const todos = activos();
  const lista = todos
    .filter(m => !q || [m.nombre, m.institucion, m.ciudad, m.provincia, m.direccion, m.especialidad].join(' ').toLowerCase().includes(q))
    .sort((a, b) => {
      if (estadoHome.orden === 'pacientes') return pacientesTotal(b) - pacientesTotal(a) || a.nombre.localeCompare(b.nombre, 'es');
      if (estadoHome.orden === 'nombre') return a.nombre.localeCompare(b.nombre, 'es');
      return estadoVisita(a).orden - estadoVisita(b).orden;
    });
  const totalPac = todos.reduce((s, m) => s + pacientesTotal(m), 0);
  const pendientes = todos.filter(m => estadoVisita(m).cls === 'late').length;

  view.innerHTML = `
    ${bannerInstalar()}
    <div class="actions">
      <button class="btn primary" id="btn-nuevo">+ Nuevo médico</button>
      <button class="btn" id="btn-pdf" ${todos.length ? '' : 'disabled'}>Generar PDF</button>
    </div>
    ${todos.length ? `
      <input class="search" id="buscar" type="search" placeholder="Buscar por nombre, institución o ciudad" value="${esc(estadoHome.filtro)}">
      <div class="segmented" role="group" aria-label="Ordenar">
        ${[['proxima', 'Próxima visita'], ['pacientes', 'Más pacientes'], ['nombre', 'Nombre']].map(([k, l]) =>
          `<button data-orden="${k}" class="${estadoHome.orden === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      <div class="summary">
        <span>${todos.length} médico(s) · ${totalPac} paciente(s) referido(s)</span>
        <span>${pendientes} pendiente(s)</span>
      </div>
      <div id="lista">${lista.map(itemMedico).join('') || '<div class="empty">Sin resultados.</div>'}</div>
    ` : `<div class="empty">Todavía no hay médicos cargados.<br>Toque <b>+ Nuevo médico</b> para comenzar.</div>`}
  `;
  $('#btn-nuevo').onclick = () => startWizard(pasosNuevoMedico(), {}, guardarNuevoMedico, 'Nuevo médico');
  $('#btn-pdf').onclick = renderFiltrosPDF;
  conectarInstalar();
  const b = $('#buscar');
  if (b) b.oninput = () => {
    estadoHome.filtro = b.value;
    const pos = b.selectionStart; renderHome();
    const nb = $('#buscar'); nb.focus(); nb.setSelectionRange(pos, pos);
  };
  view.querySelectorAll('[data-orden]').forEach(el => (el.onclick = () => { estadoHome.orden = el.dataset.orden; renderHome(); }));
  view.querySelectorAll('.doc-item').forEach(el => (el.onclick = () => renderDetalle(el.dataset.id)));
}

function itemMedico(m) {
  const e = estadoVisita(m);
  const lugar = [m.institucion, m.ciudad].filter(Boolean).join(' · ');
  return `
    <button class="doc-item" data-id="${m.id}">
      <div class="info">
        <div class="name">${esc(m.nombre)}</div>
        <div class="sub">${esc(lugar)}</div>
        <div style="margin-top:6px"><span class="pill ${e.cls}">${esc(e.txt)}</span></div>
      </div>
      <div class="count"><b>${pacientesTotal(m)}</b><small>pacientes</small></div>
    </button>`;
}

/* ---------- Asistente paso a paso ---------- */
const validarPasado = v => v <= hoy() || 'La fecha no puede ser futura.';

function pasosNuevoMedico() {
  const ultimaProv = (activos().slice(-1)[0] || {}).provincia || '';
  return [
    { key: 'nombre', q: '¿Cuál es el nombre del médico?', hint: 'Por ejemplo: Dra. María López', type: 'text', required: true },
    { key: 'especialidad', q: '¿Cuál es su especialidad?', hint: 'Puede elegir una opción o escribirla.', type: 'text', chips: ESPECIALIDADES },
    { key: 'institucion', q: '¿En qué institución atiende?', hint: 'Hospital, clínica, sanatorio o consultorio.', type: 'text', required: true, sugerencias: unicos(activos().map(m => m.institucion)) },
    { key: 'provincia', q: '¿En qué provincia?', type: 'select', required: true, opciones: PROVINCIAS, def: ultimaProv },
    { key: 'ciudad', q: '¿En qué ciudad o localidad?', hint: 'Por ejemplo: La Plata, Quilmes, Palermo.', type: 'text', required: true,
      sugerenciasFn: v => unicos(activos().filter(m => !v.provincia || m.provincia === v.provincia).map(m => m.ciudad)) },
    { key: 'direccion', q: '¿Cuál es la dirección?', hint: 'Calle y número del consultorio.', type: 'text' },
    { key: 'celular', q: 'Número de celular para WhatsApp', hint: 'Se solicita una única vez. Incluya código de país y de área, por ejemplo: +54 9 11 1234 5678.', type: 'tel', validate: v => !v || soloDigitos(v).length >= 8 || 'El número parece incompleto.' },
    { key: 'fecha', q: '¿Cuál fue la fecha de la última visita?', type: 'date', required: true, def: hoy(), max: hoy(), validate: validarPasado },
    { key: 'pacientes', q: '¿Cuántos pacientes refirió a su servicio hasta ahora?', hint: 'Total acumulado.', type: 'number', def: 0 },
    pasoProxima(),
    { key: 'notas', q: 'Notas de la visita', hint: 'Temas conversados, material entregado, próximos pasos.', type: 'textarea' }
  ];
}

function pasoProxima() {
  return {
    key: 'proximaVisita', q: '¿Cuándo es la próxima visita programada?',
    hint: `Se propone la fecha según la frecuencia de ${frecuencia()} días. Puede cambiarla o dejarla vacía.`,
    type: 'date', defFn: v => sumarDias(v.fecha || hoy(), frecuencia()), quick: true,
    validate: (x, v) => !x || x >= (v.fecha || hoy()) || 'Debe ser posterior a la fecha de la visita.'
  };
}

function pasosVisita(m) {
  return [
    { key: 'fecha', q: `Fecha de la visita a ${m.nombre}`, type: 'date', required: true, def: hoy(), max: hoy(), validate: validarPasado },
    { key: 'pacientes', q: '¿Cuántos pacientes refirió hasta ahora?', hint: `Total acumulado. Valor anterior: ${pacientesTotal(m)}.`, type: 'number', def: pacientesTotal(m) },
    pasoProxima(),
    { key: 'notas', q: 'Notas de la visita', type: 'textarea' }
  ];
}

function startWizard(pasos, datos, onFinish, titulo, onCancel) {
  let i = 0;
  const salir = onCancel || (() => renderHome());
  const valores = { ...datos };
  pasos.forEach(p => { if (valores[p.key] === undefined && p.def !== undefined) valores[p.key] = p.def; });

  function campo(p, v) {
    const val = esc(v ?? '');
    if (p.type === 'textarea') return `<textarea class="field" id="inp">${val}</textarea>`;
    if (p.type === 'select') return `<select class="field" id="inp"><option value="">Seleccione…</option>${p.opciones.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    if (p.type === 'number') return `
      <div class="stepper">
        <button class="btn" type="button" id="menos" aria-label="Restar">−</button>
        <input class="field" id="inp" type="number" inputmode="numeric" min="0" step="1" value="${val}">
        <button class="btn" type="button" id="mas" aria-label="Sumar">+</button>
      </div>`;
    if (p.type === 'date') return `<input class="field" id="inp" type="date" ${p.max ? `max="${p.max}"` : ''} value="${val}">`;
    const extra = p.type === 'tel' ? 'inputmode="tel" autocomplete="tel"' : 'autocomplete="off" autocapitalize="words"';
    return `<input class="field" id="inp" type="${p.type}" ${extra} value="${val}">`;
  }

  function paso() {
    const p = pasos[i];
    if (valores[p.key] === undefined && p.defFn) valores[p.key] = p.defFn(valores);
    const sug = p.sugerenciasFn ? p.sugerenciasFn(valores) : p.sugerencias;
    const chips = p.chips || (sug && sug.slice(0, 8));
    setHeader(titulo, () => (i > 0 ? (guardarValor(), i--, paso()) : salir()));
    view.innerHTML = `
      <div class="progress"><span style="width:${((i + 1) / pasos.length) * 100}%"></span></div>
      <div class="step-count">Paso ${i + 1} de ${pasos.length}</div>
      <form id="wform" class="card" novalidate>
        <p class="question">${esc(p.q)}${p.required ? '' : ' <span class="hint">(opcional)</span>'}</p>
        ${p.hint ? `<p class="hint">${esc(p.hint)}</p>` : ''}
        ${campo(p, valores[p.key])}
        ${chips && chips.length ? `<div class="chips">${chips.map(c => `<button type="button" class="chip" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
        ${p.quick ? `<div class="chips">
            ${[[7, '1 semana'], [15, '15 días'], [30, '1 mes'], [60, '2 meses']].map(([n, l]) => `<button type="button" class="chip" data-dias="${n}">${l}</button>`).join('')}
            <button type="button" class="chip" data-dias="">Sin fecha</button></div>` : ''}
        <div class="error" id="err"></div>
        <div class="wizard-nav">
          <button type="button" class="btn" id="atras">${i === 0 ? 'Cancelar' : 'Atrás'}</button>
          <button type="submit" class="btn primary">${i === pasos.length - 1 ? 'Revisar' : 'Siguiente'}</button>
        </div>
      </form>`;
    const inp = $('#inp');
    if (p.type !== 'date' && p.type !== 'select') setTimeout(() => inp.focus(), 50);
    if (p.type === 'number') {
      $('#menos').onclick = () => (inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) - 1));
      $('#mas').onclick = () => (inp.value = (parseInt(inp.value, 10) || 0) + 1);
    }
    view.querySelectorAll('[data-v]').forEach(c => (c.onclick = () => { inp.value = c.dataset.v; inp.focus(); }));
    view.querySelectorAll('[data-dias]').forEach(c => (c.onclick = () => {
      inp.value = c.dataset.dias ? sumarDias(valores.fecha || hoy(), Number(c.dataset.dias)) : '';
    }));
    $('#atras').onclick = () => (i === 0 ? salir() : (guardarValor(), i--, paso()));
    $('#wform').onsubmit = e => {
      e.preventDefault();
      const v = guardarValor();
      let err = '';
      if (p.required && (v === '' || v == null)) err = 'Este dato es obligatorio.';
      else if (p.type === 'number' && (!Number.isInteger(v) || v < 0)) err = 'Ingrese un número entero igual o mayor a 0.';
      else if (p.validate) { const r = p.validate(v, valores); if (r !== true) err = r; }
      if (err) { $('#err').textContent = err; inp.focus(); return; }
      if (i < pasos.length - 1) { i++; paso(); } else resumen();
    };
  }

  function guardarValor() {
    const p = pasos[i];
    const raw = $('#inp').value;
    const v = p.type === 'number' ? (raw === '' ? NaN : Number(raw)) : raw.trim();
    valores[p.key] = v;
    return v;
  }

  const mostrar = (p, v) => (p.type === 'date' ? fmtFecha(v) : v === '' || v == null ? '—' : esc(v));

  function resumen() {
    setHeader(titulo, () => paso());
    view.innerHTML = `
      <div class="card">
        <h2>Revise los datos</h2>
        ${pasos.map((p, k) => `
          <div class="label">${esc(p.q.replace(/^¿|\?$/g, ''))}</div>
          <div class="value row-between">
            <span style="white-space:pre-wrap">${mostrar(p, valores[p.key])}</span>
            <button class="chip" data-k="${k}">Editar</button>
          </div>`).join('')}
      </div>
      <div class="wizard-nav">
        <button class="btn" id="cancelar">Cancelar</button>
        <button class="btn primary" id="confirmar">Guardar</button>
      </div>`;
    view.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => { i = Number(b.dataset.k); paso(); }));
    $('#cancelar').onclick = salir;
    $('#confirmar').onclick = () => onFinish(valores);
  }

  paso();
}

function guardarNuevoMedico(v) {
  const m = {
    id: uid(),
    nombre: v.nombre, especialidad: v.especialidad || '', institucion: v.institucion,
    provincia: v.provincia, ciudad: v.ciudad, direccion: v.direccion || '',
    celular: v.celular || '', proximaVisita: v.proximaVisita || '',
    creado: ahora(), actualizado: ahora(),
    visitas: [{ id: uid(), fecha: v.fecha, pacientes: v.pacientes, notas: v.notas || '' }]
  };
  db.medicos.push(m); save();
  toast('Médico guardado.');
  renderDetalle(m.id);
}

/* ---------- Detalle del médico ---------- */
function renderDetalle(id) {
  const m = findMedico(id);
  if (!m) return renderHome();
  setHeader(m.nombre, () => renderHome());
  const tel = soloDigitos(m.celular);
  const e = estadoVisita(m);
  view.innerHTML = `
    <div class="actions">
      <button class="btn primary" id="btn-visita">Registrar visita</button>
      ${tel ? `<a class="btn wa" href="https://wa.me/${tel}" target="_blank" rel="noopener">WhatsApp</a>`
            : `<button class="btn" id="btn-editar2">Agregar celular</button>`}
    </div>
    <div class="card">
      <div class="grid2">
        <div><div class="label">Última visita</div><div class="value">${fmtFecha(ultimaVisita(m))}</div></div>
        <div><div class="label">Pacientes referidos</div><div class="value"><b>${pacientesTotal(m)}</b></div></div>
      </div>
      <div class="label">Próxima visita</div>
      <div class="value row-between"><span class="pill ${e.cls}">${m.proximaVisita ? fmtFecha(m.proximaVisita) : 'Sin programar'}</span>
        <button class="chip" id="btn-prox">Cambiar</button></div>
      <div class="label">Institución</div><div class="value">${esc(m.institucion)}</div>
      <div class="label">Ubicación</div><div class="value">${esc(ubicacionTexto(m)) || '—'}</div>
      <div class="label">Especialidad</div><div class="value">${esc(m.especialidad) || '—'}</div>
      <div class="label">Celular (WhatsApp)</div><div class="value">${esc(m.celular) || '—'}</div>
    </div>
    <div class="card">
      <h2>Historial de visitas (${m.visitas.length})</h2>
      ${ordenVisitas(m).map(v => `
        <div class="visit">
          <div class="meta"><span>${fmtFecha(v.fecha)}</span><span>${v.pacientes} pac.</span></div>
          ${v.notas ? `<p>${esc(v.notas)}</p>` : ''}
        </div>`).join('')}
    </div>
    <div class="actions">
      <button class="btn" id="btn-editar">Editar datos</button>
      <button class="btn danger" id="btn-borrar">Eliminar</button>
    </div>`;
  $('#btn-visita').onclick = () => startWizard(pasosVisita(m), {}, v => {
    m.visitas.push({ id: uid(), fecha: v.fecha, pacientes: v.pacientes, notas: v.notas || '' });
    m.proximaVisita = v.proximaVisita || '';
    tocar(m); save(); toast('Visita registrada.'); renderDetalle(m.id);
  }, 'Nueva visita', () => renderDetalle(m.id));
  $('#btn-prox').onclick = () => startWizard([{ ...pasoProxima(), defFn: () => m.proximaVisita || sumarDias(hoy(), frecuencia()), validate: x => !x || x >= hoy() || 'La fecha debe ser hoy o posterior.' }],
    { fecha: hoy() }, v => { m.proximaVisita = v.proximaVisita || ''; tocar(m); save(); toast('Próxima visita actualizada.'); renderDetalle(m.id); },
    'Próxima visita', () => renderDetalle(m.id));
  $('#btn-editar').onclick = () => renderEditar(m.id);
  if ($('#btn-editar2')) $('#btn-editar2').onclick = () => renderEditar(m.id);
  $('#btn-borrar').onclick = () => {
    if (confirm(`¿Eliminar a ${m.nombre} y todo su historial? Esta acción no se puede deshacer.`)) {
      // Se conserva una marca de borrado para que la eliminación llegue a los demás dispositivos.
      Object.keys(m).forEach(k => { if (!['id'].includes(k)) delete m[k]; });
      Object.assign(m, { borrado: true, visitas: [], actualizado: ahora() });
      save(); toast('Médico eliminado.'); renderHome();
    }
  };
}

function renderEditar(id) {
  const m = findMedico(id);
  setHeader('Editar datos', () => renderDetalle(id));
  const campos = [
    ['nombre', 'Nombre', 'text'], ['especialidad', 'Especialidad', 'text'],
    ['institucion', 'Institución', 'text'], ['provincia', 'Provincia', 'select'],
    ['ciudad', 'Ciudad o localidad', 'text'], ['direccion', 'Dirección', 'text'],
    ['celular', 'Celular (WhatsApp)', 'tel']
  ];
  view.innerHTML = `
    <form class="card" id="fedit">
      ${campos.map(([k, l, t]) => `
        <div class="form-row"><label for="e-${k}">${l}</label>
        ${t === 'select'
          ? `<select class="field" id="e-${k}"><option value="">Seleccione…</option>${PROVINCIAS.map(p => `<option ${p === m[k] ? 'selected' : ''}>${p}</option>`).join('')}</select>`
          : `<input class="field" id="e-${k}" type="${t}" value="${esc(m[k])}" ${t === 'tel' ? 'inputmode="tel"' : ''}>`}
        </div>`).join('')}
      <div class="error" id="err"></div>
      <div class="wizard-nav">
        <button type="button" class="btn" id="cancelar">Cancelar</button>
        <button type="submit" class="btn primary">Guardar</button>
      </div>
    </form>`;
  $('#cancelar').onclick = () => renderDetalle(id);
  $('#fedit').onsubmit = e => {
    e.preventDefault();
    const nuevo = Object.fromEntries(campos.map(([k]) => [k, $('#e-' + k).value.trim()]));
    if (!nuevo.nombre || !nuevo.institucion) { $('#err').textContent = 'Nombre e institución son obligatorios.'; return; }
    Object.assign(m, nuevo); tocar(m); save(); toast('Datos actualizados.'); renderDetalle(id);
  };
}

/* ---------- Filtros y generación del PDF ---------- */
let filtrosPDF = { periodo: 'todo', desde: '', hasta: '', anio: '', mes: '', institucion: '', provincia: '', ciudad: '', orden: 'nombre' };

function rangoPeriodo(f) {
  if (f.periodo === 'rango') return [f.desde || '0000-01-01', f.hasta || '9999-12-31'];
  if (f.periodo === 'anio' && f.anio) return [`${f.anio}-01-01`, `${f.anio}-12-31`];
  if (f.periodo === 'mes' && f.mes) {
    const [y, m] = f.mes.split('-').map(Number);
    return [`${f.mes}-01`, iso(new Date(y, m, 0))];
  }
  return null;
}

function descripcionFiltros(f) {
  const partes = [];
  if (f.periodo === 'rango') partes.push(`Período: ${f.desde ? fmtFecha(f.desde) : 'inicio'} al ${f.hasta ? fmtFecha(f.hasta) : 'hoy'}`);
  if (f.periodo === 'anio' && f.anio) partes.push(`Año ${f.anio}`);
  if (f.periodo === 'mes' && f.mes) { const [y, m] = f.mes.split('-'); partes.push(`Mes: ${MESES[Number(m) - 1]} de ${y}`); }
  if (f.institucion) partes.push(`Institución: ${f.institucion}`);
  if (f.provincia) partes.push(`Provincia: ${f.provincia}`);
  if (f.ciudad) partes.push(`Ciudad: ${f.ciudad}`);
  return partes.join('  ·  ');
}

/* Devuelve las filas del informe según los filtros. */
function filasInforme(f) {
  const rango = rangoPeriodo(f);
  const filas = [];
  for (const m of activos()) {
    if (f.institucion && m.institucion !== f.institucion) continue;
    if (f.provincia && m.provincia !== f.provincia) continue;
    if (f.ciudad && m.ciudad !== f.ciudad) continue;
    const vs = ordenVisitas(m); // de la más reciente a la más antigua
    let ultima = vs[0], enPeriodo = null;
    if (rango) {
      const dentro = vs.filter(v => v.fecha >= rango[0] && v.fecha <= rango[1]);
      if (!dentro.length) continue;
      ultima = dentro[0];
      const anterior = vs.find(v => v.fecha < rango[0]);
      enPeriodo = Math.max(0, (Number(ultima.pacientes) || 0) - (anterior ? Number(anterior.pacientes) || 0 : 0));
    }
    filas.push({ m, fecha: ultima ? ultima.fecha : '', pacientes: ultima ? Number(ultima.pacientes) || 0 : 0, enPeriodo });
  }
  filas.sort((a, b) => {
    if (f.orden === 'pacientes') return b.pacientes - a.pacientes || a.m.nombre.localeCompare(b.m.nombre, 'es');
    if (f.orden === 'fecha') return b.fecha.localeCompare(a.fecha);
    if (f.orden === 'institucion') return a.m.institucion.localeCompare(b.m.institucion, 'es') || a.m.nombre.localeCompare(b.m.nombre, 'es');
    return a.m.nombre.localeCompare(b.m.nombre, 'es');
  });
  return { filas, rango };
}

function renderFiltrosPDF() {
  setHeader('Generar PDF', () => renderHome());
  const f = filtrosPDF;
  const todos = activos();
  const anios = unicos(todos.flatMap(m => m.visitas.map(v => v.fecha.slice(0, 4)))).reverse();
  const instituciones = unicos(todos.map(m => m.institucion));
  const provincias = unicos(todos.map(m => m.provincia));
  const ciudades = unicos(todos.filter(m => !f.provincia || m.provincia === f.provincia).map(m => m.ciudad));
  const sel = (id, lista, actual, vacio) => `<select class="field" id="${id}"><option value="">${vacio}</option>${lista.map(x => `<option ${x === actual ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;

  view.innerHTML = `
    <div class="card">
      <h2>Período</h2>
      <div class="segmented" role="group" aria-label="Período">
        ${[['todo', 'Todo'], ['rango', 'Desde/Hasta'], ['anio', 'Año'], ['mes', 'Mes']].map(([k, l]) =>
          `<button data-per="${k}" class="${f.periodo === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      ${f.periodo === 'rango' ? `<div class="grid2">
          <div class="form-row"><label for="f-desde">Desde</label><input class="field" type="date" id="f-desde" value="${f.desde}"></div>
          <div class="form-row"><label for="f-hasta">Hasta</label><input class="field" type="date" id="f-hasta" value="${f.hasta}"></div></div>` : ''}
      ${f.periodo === 'anio' ? `<div class="form-row"><label for="f-anio">Año</label>${sel('f-anio', anios, f.anio, 'Seleccione…')}</div>` : ''}
      ${f.periodo === 'mes' ? `<div class="form-row"><label for="f-mes">Mes</label><input class="field" type="month" id="f-mes" value="${f.mes}"></div>` : ''}
      ${f.periodo !== 'todo' ? '<p class="hint">Se incluyen los médicos visitados en el período, con su última visita dentro del período y los pacientes referidos en ese lapso.</p>' : ''}
    </div>
    <div class="card">
      <h2>Filtros</h2>
      <div class="form-row"><label for="f-inst">Institución</label>${sel('f-inst', instituciones, f.institucion, 'Todas')}</div>
      <div class="grid2">
        <div class="form-row"><label for="f-prov">Provincia</label>${sel('f-prov', provincias, f.provincia, 'Todas')}</div>
        <div class="form-row"><label for="f-ciu">Ciudad</label>${sel('f-ciu', ciudades, f.ciudad, 'Todas')}</div>
      </div>
      <div class="form-row"><label for="f-orden">Ordenar por</label>
        <select class="field" id="f-orden">
          ${[['nombre', 'Nombre'], ['pacientes', 'Pacientes referidos (mayor a menor)'], ['fecha', 'Fecha de última visita'], ['institucion', 'Institución']]
            .map(([k, l]) => `<option value="${k}" ${f.orden === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>
    </div>
    <p class="summary" id="f-cuenta"></p>
    <div class="wizard-nav">
      <button class="btn" id="f-limpiar">Limpiar</button>
      <button class="btn primary" id="f-generar">Generar PDF</button>
    </div>`;

  const leerForm = () => {
    const v = id => ($(id) ? $(id).value : '');
    Object.assign(f, {
      desde: $('#f-desde') ? v('#f-desde') : f.desde, hasta: $('#f-hasta') ? v('#f-hasta') : f.hasta,
      anio: $('#f-anio') ? v('#f-anio') : f.anio, mes: $('#f-mes') ? v('#f-mes') : f.mes,
      institucion: v('#f-inst'), provincia: v('#f-prov'), ciudad: v('#f-ciu'), orden: v('#f-orden')
    });
  };
  const contar = () => {
    leerForm();
    const n = filasInforme(f).filas.length;
    $('#f-cuenta').textContent = `Se incluirán ${n} médico(s).`;
    $('#f-generar').disabled = n === 0;
  };
  view.querySelectorAll('[data-per]').forEach(b => (b.onclick = () => { leerForm(); f.periodo = b.dataset.per; renderFiltrosPDF(); }));
  view.querySelectorAll('input, select').forEach(el => (el.onchange = contar));
  $('#f-prov').onchange = () => { leerForm(); f.ciudad = ''; renderFiltrosPDF(); };
  $('#f-limpiar').onclick = () => { filtrosPDF = { periodo: 'todo', desde: '', hasta: '', anio: '', mes: '', institucion: '', provincia: '', ciudad: '', orden: 'nombre' }; renderFiltrosPDF(); };
  $('#f-generar').onclick = () => { leerForm(); generarPDF(f); };
  contar();
}

let logoCache;
async function cargarLogo() {
  if (logoCache !== undefined) return logoCache;
  try {
    const r = await fetch('logo.png');
    if (!r.ok) throw new Error();
    const blob = await r.blob();
    const url = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
    logoCache = { url, w: img.naturalWidth, h: img.naturalHeight };
  } catch (_) { logoCache = null; }
  return logoCache;
}

async function generarPDF(f) {
  if (!window.jspdf) { toast('No se pudo cargar el generador de PDF.'); return; }
  const { filas, rango } = filasInforme(f);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  let x = 14;
  const logo = await cargarLogo();
  if (logo) {
    let h = 16, w = (logo.w / logo.h) * h;
    if (w > 45) { w = 45; h = (logo.h / logo.w) * w; }
    doc.addImage(logo.url, 'PNG', 14, 7, w, h);
    x = 14 + w + 5;
  }
  doc.setFontSize(16); doc.setTextColor(11, 110, 138);
  doc.text('Alveon – Oxigenoterapia', x, 15);
  doc.setFontSize(11); doc.setTextColor(60);
  doc.text('Registro de visitas a médicos', x, 21.5);
  doc.setFontSize(9);
  doc.text(`Fecha de emisión: ${fmtFecha(hoy())}`, pageW - 14, 15, { align: 'right' });
  if (db.config.representante) doc.text(`Representante: ${db.config.representante}`, pageW - 14, 21.5, { align: 'right' });
  const desc = descripcionFiltros(f);
  let y = 27;
  if (desc) { doc.setTextColor(90); doc.text(desc, 14, y); y += 3; }

  const conPeriodo = !!rango;
  const head = ['Nombre', 'Institución', 'Fecha última visita', 'Pacientes referidos (total)']
    .concat(conPeriodo ? ['Referidos en el período'] : [])
    .concat(['Próxima visita', 'Ubicación', 'Provincia', 'Especialidad', 'Celular (WhatsApp)']);
  const body = filas.map(r => [r.m.nombre, r.m.institucion, fmtFecha(r.fecha), String(r.pacientes)]
    .concat(conPeriodo ? [String(r.enPeriodo)] : [])
    .concat([r.m.proximaVisita ? fmtFecha(r.m.proximaVisita) : '', [r.m.direccion, r.m.ciudad].filter(Boolean).join(', '), r.m.provincia, r.m.especialidad, r.m.celular]));
  const total = filas.reduce((s, r) => s + r.pacientes, 0);
  const totalPer = filas.reduce((s, r) => s + (r.enPeriodo || 0), 0);
  const foot = ['Total', `${filas.length} médico(s)`, '', String(total)].concat(conPeriodo ? [String(totalPer)] : []).concat(['', '', '', '', '']);
  const centro = { halign: 'center' };
  const colStyles = { 2: { ...centro, cellWidth: 22 }, 3: { ...centro, cellWidth: 22 } };
  if (conPeriodo) colStyles[4] = { ...centro, cellWidth: 22 };
  colStyles[conPeriodo ? 5 : 4] = { ...centro, cellWidth: 20 };

  doc.autoTable({
    startY: y + 1,
    head: [head], body, foot: [foot], showFoot: 'lastPage',
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
    headStyles: { fillColor: [11, 110, 138], textColor: 255, halign: 'center', fontSize: 8 },
    footStyles: { fillColor: [230, 240, 244], textColor: 20, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    columnStyles: colStyles,
    didParseCell: d => { if (d.section === 'foot' && (d.column.index === 3 || (conPeriodo && d.column.index === 4))) d.cell.styles.halign = 'center'; },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageW - 14, h - 8, { align: 'right' });
      if (conPeriodo) doc.text('Referidos en el período: diferencia entre el total informado en la última visita del período y el total previo al período.', 14, h - 8);
    }
  });

  const nombre = `alveon-visitas-${hoy()}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], nombre, { type: 'application/pdf' });
  // En el celular se ofrece compartir (WhatsApp, correo, Drive); si no está disponible, se descarga.
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: 'Registro de visitas – Alveon' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  descargar(blob, nombre);
  toast('PDF generado.');
}

/* ---------- Sincronización con Google Drive ---------- */
const clientId = () => (window.ALVEON_CONFIG || {}).googleClientId || local.clientId;
let syncTimer = null, sincronizando = false;

function programarSync() {
  clearTimeout(syncTimer);
  if (Drive.tieneToken()) syncTimer = setTimeout(() => sincronizar(false), 2000);
}

async function sincronizar(interactivo) {
  if (sincronizando) return;
  if (!navigator.onLine) { if (interactivo) toast('Sin conexión. Se sincronizará más tarde.'); return; }
  sincronizando = true; pintarNube();
  try {
    if (!Drive.tieneToken()) {
      if (!interactivo) return;
      await Drive.autorizar(clientId(), !local.driveConectado);
    }
    const respaldo = local.ultimoRespaldo !== hoy() ? hoy() : null;
    const datos = await Drive.sincronizar(db, combinar, respaldo);
    db = normalizar(datos);
    escribir(STORAGE_KEY, db);
    Object.assign(local, { driveConectado: true, ultimaSync: ahora(), pendiente: false });
    if (respaldo) local.ultimoRespaldo = respaldo;
    guardarLocal();
    if (interactivo) toast('Datos sincronizados con Google Drive.');
    refrescarVista();
  } catch (e) {
    if (interactivo) toast(e.message || 'No se pudo sincronizar.');
  } finally {
    sincronizando = false; pintarNube();
  }
}

let refrescarVista = () => renderHome();

function pintarNube() {
  const b = $('#btn-sync');
  if (!local.driveConectado) { b.hidden = true; return; }
  b.hidden = false;
  b.classList.toggle('girando', sincronizando);
  b.dataset.estado = local.pendiente ? 'pendiente' : Drive.tieneToken() ? 'ok' : 'inactivo';
  b.title = local.pendiente ? 'Hay cambios sin sincronizar. Toque para sincronizar.' :
    `Última sincronización: ${local.ultimaSync ? new Date(local.ultimaSync).toLocaleString('es-AR') : '—'}`;
}

/* ---------- Instalación como aplicación ---------- */
let eventoInstalar = null;
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); eventoInstalar = e; if ($('#lista') || $('#btn-nuevo')) renderHome(); });
window.addEventListener('appinstalled', () => { eventoInstalar = null; toast('Aplicación instalada.'); });

function bannerInstalar() {
  if (instalada() || !eventoInstalar) return '';
  return `<div class="card banner"><span>Instale la aplicación en este dispositivo para abrirla con un toque.</span>
    <button class="btn primary" id="btn-instalar">Instalar</button></div>`;
}
function conectarInstalar() {
  const b = $('#btn-instalar');
  if (b) b.onclick = async () => { eventoInstalar.prompt(); await eventoInstalar.userChoice; eventoInstalar = null; renderHome(); };
}

/* ---------- Ajustes ---------- */
function renderAjustes() {
  setHeader('Ajustes', () => renderHome());
  const cidFijo = !!(window.ALVEON_CONFIG || {}).googleClientId;
  view.innerHTML = `
    <form class="card" id="fcfg">
      <h2>Datos generales</h2>
      <div class="form-row"><label for="c-rep">Nombre del representante (aparece en el PDF)</label>
        <input class="field" id="c-rep" value="${esc(db.config.representante)}"></div>
      <div class="form-row"><label for="c-frec">Frecuencia de visita deseada (días)</label>
        <input class="field" id="c-frec" type="number" inputmode="numeric" min="1" value="${esc(frecuencia())}"></div>
      <button class="btn primary" type="submit">Guardar ajustes</button>
    </form>

    <div class="card">
      <h2>Google Drive</h2>
      <p class="hint">Sincroniza los datos entre el celular, la Mac y la computadora con Linux, y guarda un respaldo diario en la carpeta <b>Alveon Visitas</b> de su Drive.</p>
      ${cidFijo ? '' : `<div class="form-row"><label for="c-cid">ID de cliente de Google</label>
        <input class="field" id="c-cid" value="${esc(local.clientId)}" placeholder="xxxxxxxx.apps.googleusercontent.com" autocomplete="off"></div>`}
      <p class="hint">${local.driveConectado
        ? `Conectado. Última sincronización: ${local.ultimaSync ? new Date(local.ultimaSync).toLocaleString('es-AR') : '—'}.`
        : 'No conectado.'}</p>
      <div class="actions">
        <button class="btn primary" id="c-sync">${local.driveConectado ? 'Sincronizar ahora' : 'Conectar Google Drive'}</button>
        ${local.driveConectado ? '<button class="btn danger" id="c-desc">Desconectar</button>' : ''}
      </div>
    </div>

    <div class="card">
      <h2>Instalar en otros dispositivos</h2>
      <p class="hint">Abra la página de instalación para ver el enlace, un código QR para el celular y las instrucciones para cada equipo.</p>
      ${eventoInstalar && !instalada() ? '<button class="btn primary" id="c-inst" style="margin-bottom:10px">Instalar en este dispositivo</button>' : ''}
      <a class="btn" href="instalar.html">Página de instalación</a>
    </div>

    <div class="card">
      <h2>Copia de seguridad manual</h2>
      <p class="hint">Archivo JSON con todos los datos, para guardar o pasar a otro equipo.</p>
      <div class="actions">
        <button class="btn" id="exp">Exportar copia</button>
        <label class="btn" for="imp">Importar copia</label>
      </div>
      <input type="file" id="imp" accept="application/json,.json" hidden>
    </div>`;

  $('#fcfg').onsubmit = e => {
    e.preventDefault();
    db.config.representante = $('#c-rep').value.trim();
    db.config.frecuenciaDias = Math.max(1, parseInt($('#c-frec').value, 10) || 30);
    db.config.actualizado = ahora();
    save(); toast('Ajustes guardados.'); renderHome();
  };
  $('#c-sync').onclick = async () => {
    if ($('#c-cid')) { local.clientId = $('#c-cid').value.trim(); guardarLocal(); }
    if (!clientId()) { toast('Primero ingrese el ID de cliente de Google.'); return; }
    refrescarVista = renderAjustes;
    await sincronizar(true);
    refrescarVista = renderHome;
    renderAjustes();
  };
  if ($('#c-desc')) $('#c-desc').onclick = () => {
    if (!confirm('¿Desconectar Google Drive en este dispositivo? Los datos locales y los de Drive se conservan.')) return;
    Drive.desconectar(); Object.assign(local, { driveConectado: false, pendiente: false }); guardarLocal(); pintarNube(); renderAjustes();
  };
  if ($('#c-inst')) $('#c-inst').onclick = async () => { eventoInstalar.prompt(); await eventoInstalar.userChoice; eventoInstalar = null; renderAjustes(); };
  $('#exp').onclick = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    descargar(blob, `alveon-visitas-respaldo-${hoy()}.json`);
  };
  $('#imp').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!d || !Array.isArray(d.medicos)) throw new Error();
      if (!confirm(`El archivo contiene ${d.medicos.filter(m => !m.borrado).length} médico(s). Se combinará con los datos actuales. ¿Continuar?`)) return;
      db = combinar(db, d);
      save(); toast('Copia importada.'); renderHome();
    } catch (_) { toast('El archivo no es una copia válida.'); }
  };
}

function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- Inicio ---------- */
$('#btn-settings').onclick = renderAjustes;
$('#btn-sync').onclick = () => sincronizar(true);
window.addEventListener('online', programarSync);
escribir(STORAGE_KEY, db); // guarda la migración de datos, si hubo
renderHome();
pintarNube();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
