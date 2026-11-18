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
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS_LARGO = { Lun: 'lunes', Mar: 'martes', 'Mié': 'miércoles', Jue: 'jueves', Vie: 'viernes', 'Sáb': 'sábados', Dom: 'domingos' };
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

const CONFIG_BASE = {
  representante: '', frecuenciaDias: 30, actualizado: '',
  frecControlPac: 30,      // días entre controles de pacientes
  mantDiasConc: 180,       // mantenimiento del concentrador: cada cuántos días
  mantHorasConc: 5000,     // mantenimiento del concentrador: cada cuántas horas de uso (0 = no usar)
  mantDiasCpap: 180        // servicio del CPAP: cada cuántos días
};

function normalizar(d) {
  const base = { medicos: [], pacientes: [], config: { ...CONFIG_BASE } };
  if (!d || !Array.isArray(d.medicos)) return base;
  d.config = { ...CONFIG_BASE, ...(d.config || {}) };
  d.pacientes = (d.pacientes || []).map(p => ({
    ...p, estado: p.estado || 'activo', actualizado: p.actualizado || p.creado || '',
    registros: (p.registros || []).map(r => ({ ...r, id: r.id || uid() }))
  }));
  d.medicos.forEach(m => {
    // Migración de la versión anterior: "ubicacion" pasa a "direccion".
    if (m.ubicacion !== undefined && m.direccion === undefined) { m.direccion = m.ubicacion; delete m.ubicacion; }
    m.direccion = m.direccion || ''; m.ciudad = m.ciudad || ''; m.provincia = m.provincia || '';
    m.proximaVisita = m.proximaVisita || '';
    m.horarios = (m.horarios || []).map(h => ({ ...h, id: h.id || uid() }));
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
const vacio = v => v === '' || v == null;
const igual = (x, y) => (vacio(x) && vacio(y)) || JSON.stringify(x) === JSON.stringify(y);

/* Modifica datos de un médico o paciente registrando cuándo cambió cada campo.
   Así, al sincronizar, se conserva el cambio más reciente de cada dato y no el de la ficha completa. */
function cambiar(obj, cambios) {
  const t = ahora();
  obj.t = obj.t || {};
  for (const [k, v] of Object.entries(cambios)) {
    if (igual(obj[k], v)) continue;
    obj[k] = v; obj.t[k] = t;
  }
  obj.actualizado = t;
  return obj;
}
// Marca todos los campos de un registro nuevo con la fecha de creación.
function sellar(obj) {
  const t = obj.actualizado || ahora();
  obj.t = {};
  Object.keys(obj).forEach(k => { if (!CAMPOS_SIN_SELLO.includes(k)) obj.t[k] = t; });
  return obj;
}
const CAMPOS_SIN_SELLO = ['id', 't', 'creado', 'actualizado', 'visitas', 'registros', 'horarios'];

// Elimina un médico o paciente dejando una marca de borrado que llega a los demás dispositivos.
function marcarBorrado(obj, sub) {
  Object.keys(obj).forEach(k => { if (k !== 'id') delete obj[k]; });
  const t = ahora();
  Object.assign(obj, { borrado: true, [sub]: [], actualizado: t, t: { borrado: t } });
}

/* Combina dos copias de los datos (de distintos dispositivos).
   Cada campo conserva su modificación más reciente; visitas, actividades y horarios se unen. */
function combinar(a, b) {
  a = normalizar(JSON.parse(JSON.stringify(a)));
  b = normalizar(JSON.parse(JSON.stringify(b)));
  const config = (a.config.actualizado || '') >= (b.config.actualizado || '') ? a.config : b.config;
  return {
    medicos: combinarLista(a.medicos, b.medicos, 'visitas'),
    pacientes: combinarLista(a.pacientes, b.pacientes, 'registros'),
    config
  };
}

function combinarLista(la, lb, sub) {
  const mapa = new Map();
  for (const m of [...la, ...lb]) {
    const prev = mapa.get(m.id);
    mapa.set(m.id, prev ? combinarFicha(prev, m, sub) : m);
  }
  return [...mapa.values()];
}

function combinarFicha(a, b, sub) {
  const ra = a.actualizado || '', rb = b.actualizado || '';
  const res = { id: a.id, t: {} };
  const claves = new Set([...Object.keys(a), ...Object.keys(b)].filter(k => !['id', 't', 'actualizado', sub, 'horarios'].includes(k)));
  // Fecha de un campo: la propia si se registró; en fichas de versiones anteriores (sin fechas por campo), la de la ficha.
  const fecha = (x, k) => (x.t ? x.t[k] || '' : x.actualizado || '');
  const propia = (x, k) => !!(x.t && x.t[k]);
  for (const k of claves) {
    let deB = fecha(b, k) > fecha(a, k);
    // Un dato vacío sin fecha propia no borra un dato completo del otro dispositivo.
    if (deB && !propia(b, k) && vacio(b[k]) && !vacio(a[k])) deB = false;
    else if (!deB && !propia(a, k) && vacio(a[k]) && !vacio(b[k])) deB = true;
    const v = deB ? b[k] : a[k];
    if (v !== undefined) res[k] = v;
    const tk = deB ? (b.t && b.t[k]) : (a.t && a.t[k]);
    if (tk) res.t[k] = tk;
  }
  res.actualizado = ra > rb ? ra : rb;
  // Listas: visitas y actividades se unen; en horarios, por cada uno gana su versión más reciente (incluido el borrado).
  const items = new Map();
  [...(a[sub] || []), ...(b[sub] || [])].forEach(v => items.set(v.id, v));
  res[sub] = res.borrado ? [] : [...items.values()];
  if (a.horarios || b.horarios) {
    const hs = new Map();
    [...(a.horarios || []), ...(b.horarios || [])].forEach(h => {
      const ya = hs.get(h.id);
      if (!ya || (h.actualizado || '') > (ya.actualizado || '')) hs.set(h.id, h);
    });
    res.horarios = [...hs.values()];
  }
  return res;
}

/* ---------- Cálculos ---------- */
const ordenVisitas = m => [...m.visitas].sort((x, y) => y.fecha.localeCompare(x.fecha));
const ultimaVisita = m => (ordenVisitas(m)[0] || {}).fecha || '';
// El total vigente es el informado en la visita más reciente.
const pacientesTotal = m => Number((ordenVisitas(m)[0] || {}).pacientes) || 0;
const ubicacionTexto = m => [m.direccion, m.ciudad, m.provincia].filter(Boolean).join(', ');

/* ---------- Días y horarios de atención ---------- */
const diasDe = h => String(h.dias || '').split(',').filter(Boolean).sort((a, b) => DIAS.indexOf(a) - DIAS.indexOf(b));
function listaDias(dias) {
  const l = dias.map(d => DIAS_LARGO[d] || d);
  return l.length > 1 ? l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1] : l[0] || '';
}
const capitalizar = t => (t ? t[0].toUpperCase() + t.slice(1) : '');
const rangoHoras = h => (h.desde || h.hasta ? `${h.desde || '…'} a ${h.hasta || '…'} h` : '');
const diaHoy = () => DIAS[(new Date().getDay() + 6) % 7];
const ordenHorarios = m => (m.horarios || []).filter(h => !h.borrado).sort((a, b) =>
  DIAS.indexOf(diasDe(a)[0]) - DIAS.indexOf(diasDe(b)[0]) || String(a.desde).localeCompare(String(b.desde)));
const horariosHoy = m => ordenHorarios(m).filter(h => diasDe(h).includes(diaHoy()));

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

// Los avisos duran 2 segundos; los mensajes de error, más tiempo para poder leerlos.
function toast(msg, ms = 2000) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
let seccion = 'medicos';
function irInicio() { return seccion === 'pacientes' ? renderPacientes() : renderHome(); }

function setHeader(title, back) {
  $('#title').textContent = title;
  $('#btn-back').hidden = !back;
  $('#btn-back').onclick = back || null;
  const nav = $('#bottom-nav');
  if (nav) {
    nav.hidden = !!back;
    document.body.classList.toggle('con-nav', !back);
    nav.querySelectorAll('[data-sec]').forEach(b => b.classList.toggle('on', b.dataset.sec === seccion));
  }
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
  seccion = 'medicos';
  setHeader('Visitas a médicos', null);
  const q = estadoHome.filtro.trim().toLowerCase();
  const todos = activos();
  const lista = todos
    .filter(m => !q || [m.nombre, m.institucion, m.ciudad, m.provincia, m.direccion, m.especialidad, ...(m.horarios || []).map(h => h.lugar)].join(' ').toLowerCase().includes(q))
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
        <div class="pills"><span class="pill ${e.cls}">${esc(e.txt)}</span>
          ${horariosHoy(m).map(h => `<span class="pill info">Atiende hoy${h.desde ? ' ' + esc(h.desde) + (h.hasta ? '–' + esc(h.hasta) : '') : ''}</span>`).join('')}</div>
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
    pasoHorario(false),
    { key: 'celular', q: 'Número de celular para WhatsApp', hint: 'Se solicita una única vez. Incluya código de país y de área, por ejemplo: +54 9 11 1234 5678.', type: 'tel', validate: v => !v || soloDigitos(v).length >= 8 || 'El número parece incompleto.' },
    { key: 'fecha', q: '¿Cuál fue la fecha de la última visita?', type: 'date', required: true, def: hoy(), max: hoy(), validate: validarPasado },
    { key: 'pacientes', q: '¿Cuántos pacientes refirió a su servicio hasta ahora?', hint: 'Total acumulado.', type: 'number', def: 0 },
    pasoProxima(),
    { key: 'notas', q: 'Notas de la visita', hint: 'Temas conversados, material entregado, próximos pasos.', type: 'textarea' }
  ];
}

function pasoHorario(obligatorio, institucion) {
  const validarHasta = (x, v) => !v.desde || x > v.desde || 'Debe ser posterior a la hora de inicio.';
  return { q: obligatorio ? 'Días y horario de atención' : '¿Qué días y en qué horario atiende?',
    hint: obligatorio ? '' : 'Opcional. Si atiende en varios lugares, cargue uno ahora y agregue los demás desde su perfil.',
    campos: [
      { key: 'dias', label: 'Días', type: 'multi', opciones: DIAS, required: obligatorio },
      { key: 'desde', label: 'Desde', type: 'time' },
      { key: 'hasta', label: 'Hasta', type: 'time', validate: validarHasta },
      { key: 'lugar', label: 'Lugar donde atiende', type: 'text', hint: 'Institución, sede o consultorio.',
        defFn: v => v.institucion || institucion || '',
        sugerencias: unicos([...activos().map(m => m.institucion), ...activos().flatMap(m => (m.horarios || []).map(h => h.lugar))]) },
      { key: 'detalleHorario', label: 'Observaciones', type: 'text', chips: ['Con turno previo', 'Por orden de llegada', 'Consultorio externo', 'Guardia'] }
    ] };
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

/* Asistente genérico.
   Cada paso puede ser un campo único ({ key, q, type, ... }) o un grupo ({ q, campos: [...] }).
   Campos: key, label, type (text|tel|date|number|select|choice|textarea), required, def, defFn(valores),
   opciones, chips, sugerencias, sugerenciasFn(valores), hint, validate(v, valores), max, entero, quick, si(valores).
   Pasos y campos con "si" se muestran sólo cuando la condición se cumple.
   opts.resumen = true abre directamente la pantalla de revisión (para editar). */
function startWizard(pasos, datos, onFinish, titulo, onCancel, opts = {}) {
  let i = 0;
  const salir = onCancel || irInicio;
  const valores = { ...datos };
  const camposDe = p => (p.campos ? p.campos : [{ ...p, label: p.q }]);
  const aplica = x => !x.si || x.si(valores);
  const opcionesDe = c => (c.opciones || []).map(o => (Array.isArray(o) ? o : [o, o]));
  pasos.forEach(p => camposDe(p).forEach(c => { if (valores[c.key] === undefined && c.def !== undefined) valores[c.key] = c.def; }));
  const siguiente = dir => { let j = i + dir; while (j >= 0 && j < pasos.length && !aplica(pasos[j])) j += dir; return j; };
  const visibles = () => pasos.filter(aplica);

  function control(c, v, unico) {
    const val = esc(v ?? '');
    const id = 'inp-' + c.key;
    if (c.type === 'textarea') return `<textarea class="field" id="${id}">${val}</textarea>`;
    if (c.type === 'select') return `<select class="field" id="${id}"><option value="">Seleccione…</option>${opcionesDe(c).map(([o, l]) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    if (c.type === 'choice') return `<div class="choice" data-key="${c.key}">${opcionesDe(c).map(([o, l]) =>
      `<button type="button" class="${o === v ? 'on' : ''}" data-val="${esc(o)}">${esc(l)}</button>`).join('')}</div>
      <input type="hidden" id="${id}" value="${val}">`;
    if (c.type === 'number' && unico && c.entero !== false) return `
      <div class="stepper">
        <button class="btn" type="button" data-step="-1" aria-label="Restar">−</button>
        <input class="field" id="${id}" type="number" inputmode="numeric" min="0" step="1" value="${val}">
        <button class="btn" type="button" data-step="1" aria-label="Sumar">+</button>
      </div>`;
    if (c.type === 'number') return `<input class="field" id="${id}" type="number" inputmode="decimal" min="0" step="any" value="${val}">`;
    if (c.type === 'date') return `<input class="field" id="${id}" type="date" ${c.max ? `max="${c.max}"` : ''} value="${val}">`;
    if (c.type === 'time') return `<input class="field" id="${id}" type="time" value="${val}">`;
    if (c.type === 'multi') {
      const elegidos = String(v || '').split(',');
      return `<div class="choice multi" data-multi="${c.key}">${opcionesDe(c).map(([o, l]) =>
        `<button type="button" class="${elegidos.includes(o) ? 'on' : ''}" data-val="${esc(o)}" aria-pressed="${elegidos.includes(o)}">${esc(l)}</button>`).join('')}</div>
        <input type="hidden" id="${id}" value="${val}">`;
    }
    const extra = c.type === 'tel' ? 'inputmode="tel" autocomplete="tel"' : 'autocomplete="off" autocapitalize="sentences"';
    return `<input class="field" id="${id}" type="${c.type === 'tel' ? 'tel' : 'text'}" ${extra} value="${val}">`;
  }

  function extras(c) {
    const sug = c.sugerenciasFn ? c.sugerenciasFn(valores) : c.sugerencias;
    const chips = c.chips || (sug && sug.slice(0, 8));
    let h = '';
    if (chips && chips.length) h += `<div class="chips">${chips.map(x => `<button type="button" class="chip" data-for="${c.key}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
    if (c.quick) h += `<div class="chips">
      ${[[7, '1 semana'], [15, '15 días'], [30, '1 mes'], [60, '2 meses'], [90, '3 meses']].map(([n, l]) => `<button type="button" class="chip" data-for="${c.key}" data-dias="${n}">${l}</button>`).join('')}
      <button type="button" class="chip" data-for="${c.key}" data-dias="">Sin fecha</button></div>`;
    return h;
  }

  function paso() {
    const p = pasos[i];
    const campos = camposDe(p).filter(aplica);
    // Valores propuestos que dependen de otros datos; se recalculan mientras el usuario no los modifique.
    campos.forEach(c => { if (c.defFn && (valores[c.key] === undefined || valores[c.key] === c._propuesto)) valores[c.key] = c._propuesto = c.defFn(valores); });
    const vis = visibles(), n = vis.indexOf(p) + 1;
    const unico = !p.campos;
    setHeader(titulo, atras);
    view.innerHTML = `
      <div class="progress"><span style="width:${(n / vis.length) * 100}%"></span></div>
      <div class="step-count">Paso ${n} de ${vis.length}</div>
      <form id="wform" class="card" novalidate>
        <p class="question">${esc(p.q)}${unico && !p.required ? ' <span class="hint">(opcional)</span>' : ''}</p>
        ${p.hint ? `<p class="hint">${esc(p.hint)}</p>` : ''}
        ${campos.map(c => `
          <div class="form-row">
            ${unico ? '' : `<label for="inp-${c.key}">${esc(c.label)}${c.required ? '' : ' <span class="hint">(opcional)</span>'}</label>
            ${c.hint ? `<p class="hint" style="margin:0 0 6px">${esc(c.hint)}</p>` : ''}`}
            ${control(c, valores[c.key], unico)}
            ${extras(c)}
            <div class="error" id="err-${c.key}"></div>
          </div>`).join('')}
        <div class="wizard-nav">
          <button type="button" class="btn" id="atras">${siguiente(-1) < 0 ? 'Cancelar' : 'Atrás'}</button>
          <button type="submit" class="btn primary">${siguiente(1) >= pasos.length ? 'Revisar' : 'Siguiente'}</button>
        </div>
      </form>`;
    const primero = campos.find(c => !['date', 'select', 'choice', 'multi', 'time'].includes(c.type));
    if (unico && primero) setTimeout(() => $('#inp-' + primero.key)?.focus(), 50);
    view.querySelectorAll('[data-step]').forEach(b => (b.onclick = () => {
      const inp = b.parentNode.querySelector('input');
      inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) + Number(b.dataset.step));
    }));
    view.querySelectorAll('.chip[data-v]').forEach(b => (b.onclick = () => { const inp = $('#inp-' + b.dataset.for); inp.value = b.dataset.v; inp.focus(); }));
    view.querySelectorAll('.chip[data-dias]').forEach(b => (b.onclick = () => {
      $('#inp-' + b.dataset.for).value = b.dataset.dias ? sumarDias(valores.fecha || hoy(), Number(b.dataset.dias)) : '';
    }));
    // Una opción elegida puede mostrar u ocultar otros campos: se vuelve a dibujar el paso.
    view.querySelectorAll('.choice.multi button').forEach(b => (b.onclick = () => {
      b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on'));
      const caja = b.closest('.choice');
      $('#inp-' + caja.dataset.multi).value = [...caja.querySelectorAll('button.on')].map(x => x.dataset.val).join(',');
    }));
    view.querySelectorAll('.choice:not(.multi) button').forEach(b => (b.onclick = () => {
      guardar(); valores[b.closest('.choice').dataset.key] = b.dataset.val; paso();
    }));
    $('#atras').onclick = atras;
    $('#wform').onchange = () => {
      guardar();
      campos.filter(c => c.defFn && valores[c.key] === c._propuesto).forEach(c => {
        c._propuesto = c.defFn(valores);
        valores[c.key] = c._propuesto;
        const el = $('#inp-' + c.key); if (el) el.value = c._propuesto;
      });
    };
    $('#wform').onsubmit = e => {
      e.preventDefault();
      guardar();
      let ok = true;
      for (const c of campos) {
        const v = valores[c.key];
        let err = '';
        if (c.required && (v === '' || v == null || Number.isNaN(v))) err = 'Este dato es obligatorio.';
        else if (c.type === 'number' && v !== '' && v != null && (Number.isNaN(v) || v < 0)) err = 'Ingrese un número igual o mayor a 0.';
        else if (c.type === 'number' && unico && c.entero !== false && v !== '' && !Number.isInteger(v)) err = 'Ingrese un número entero.';
        else if (c.validate && v !== '' && v != null) { const r = c.validate(v, valores); if (r !== true) err = r; }
        $('#err-' + c.key).textContent = err;
        if (err && ok) { ok = false; $('#inp-' + c.key)?.focus(); }
      }
      if (!ok) return;
      const j = siguiente(1);
      if (j >= pasos.length) resumen(); else { i = j; paso(); }
    };
  }

  function atras() {
    guardar();
    const j = siguiente(-1);
    if (j < 0) salir(); else { i = j; paso(); }
  }

  function guardar() {
    camposDe(pasos[i]).filter(aplica).forEach(c => {
      const el = $('#inp-' + c.key);
      if (!el) return;
      const raw = el.value;
      valores[c.key] = c.type === 'number' ? (raw === '' ? '' : Number(raw)) : raw.trim();
    });
  }

  function mostrar(c, v) {
    if (v === '' || v == null) return '—';
    if (c.type === 'date') return fmtFecha(v);
    if (c.type === 'multi') return esc(listaDias(String(v).split(',').filter(Boolean).sort((a, b) => DIAS.indexOf(a) - DIAS.indexOf(b))));
    if (c.type === 'select' || c.type === 'choice') { const o = opcionesDe(c).find(([x]) => x === v); return esc(o ? o[1] : v); }
    return esc(v);
  }

  function resumen() {
    // "Volver" desde la revisión lleva al último paso que corresponde.
    setHeader(titulo, () => { i = [...pasos.keys()].filter(k => aplica(pasos[k])).pop(); paso(); });
    view.innerHTML = `
      <div class="card">
        <h2>Revise los datos</h2>
        ${pasos.map((p, k) => (aplica(p) ? camposDe(p).filter(aplica).map(c => `
          <div class="label">${esc((c.label || '').replace(/^¿|\?$/g, ''))}</div>
          <div class="value row-between">
            <span style="white-space:pre-wrap">${mostrar(c, valores[c.key])}</span>
            <button class="chip" data-k="${k}">Editar</button>
          </div>`).join('') : '')).join('')}
      </div>
      <div class="wizard-nav">
        <button class="btn" id="cancelar">Cancelar</button>
        <button class="btn primary" id="confirmar">Guardar</button>
      </div>`;
    view.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => { i = Number(b.dataset.k); paso(); }));
    $('#cancelar').onclick = salir;
    $('#confirmar').onclick = () => {
      // Los campos que no corresponden (por ejemplo, datos de venta en un alquiler) se vacían.
      // Un mismo dato (por ejemplo, la fecha) puede aparecer en varios pasos alternativos: se conserva si alguno corresponde.
      const usados = new Set();
      pasos.forEach(p => { if (aplica(p)) camposDe(p).forEach(c => { if (aplica(c)) usados.add(c.key); }); });
      pasos.forEach(p => camposDe(p).forEach(c => { if (!usados.has(c.key)) valores[c.key] = ''; }));
      onFinish(valores);
    };
  }

  if (opts.resumen) resumen(); else paso();
}

const horarioDe = v => ({ id: v.id || uid(), dias: v.dias, desde: v.desde || '', hasta: v.hasta || '', lugar: v.lugar || '', detalle: v.detalleHorario || '', actualizado: ahora() });

function guardarNuevoMedico(v) {
  const m = {
    id: uid(),
    nombre: v.nombre, especialidad: v.especialidad || '', institucion: v.institucion,
    provincia: v.provincia, ciudad: v.ciudad, direccion: v.direccion || '',
    celular: v.celular || '', proximaVisita: v.proximaVisita || '',
    creado: ahora(), actualizado: ahora(),
    visitas: [{ id: uid(), fecha: v.fecha, pacientes: v.pacientes, notas: v.notas || '' }],
    horarios: v.dias ? [horarioDe(v)] : []
  };
  sellar(m);
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
      <h2>Días y horarios de atención</h2>
      ${ordenHorarios(m).map(h => `
        <div class="visit">
          <div class="meta"><span>${esc(capitalizar(listaDias(diasDe(h))))}</span>
            ${diasDe(h).includes(diaHoy()) ? '<span class="pill info">Hoy</span>' : ''}</div>
          <p>${[rangoHoras(h), h.lugar, h.detalle].filter(Boolean).map(esc).join(' · ')}</p>
          <div class="chips" style="margin-top:6px">
            <button class="chip" data-hor-edit="${h.id}">Editar</button>
            <button class="chip" data-hor-del="${h.id}">Borrar</button>
          </div>
        </div>`).join('') || '<p class="hint">Sin horarios cargados.</p>'}
      <button class="btn" id="btn-hor" style="margin-top:10px">+ Agregar horario</button>
    </div>
    <div class="card">
      <h2>Historial de visitas (${m.visitas.length})</h2>
      ${ordenVisitas(m).map(v => `
        <div class="visit">
          <div class="meta"><span>${fmtFecha(v.fecha)}</span><span>${v.pacientes} pac.</span></div>
          ${v.notas ? `<p>${esc(v.notas)}</p>` : ''}
        </div>`).join('')}
    </div>
    ${bloquePacientesMedico(m)}
    <div class="actions">
      <button class="btn" id="btn-editar">Editar datos</button>
      <button class="btn danger" id="btn-borrar">Eliminar</button>
    </div>`;
  $('#btn-visita').onclick = () => startWizard(pasosVisita(m), {}, v => {
    m.visitas.push({ id: uid(), fecha: v.fecha, pacientes: v.pacientes, notas: v.notas || '' });
    cambiar(m, { proximaVisita: v.proximaVisita || '' });
    save(); toast('Visita registrada.'); renderDetalle(m.id);
  }, 'Nueva visita', () => renderDetalle(m.id));
  $('#btn-prox').onclick = () => startWizard([{ ...pasoProxima(), defFn: () => m.proximaVisita || sumarDias(hoy(), frecuencia()), validate: x => !x || x >= hoy() || 'La fecha debe ser hoy o posterior.' }],
    { fecha: hoy() }, v => { cambiar(m, { proximaVisita: v.proximaVisita || '' }); save(); toast('Próxima visita actualizada.'); renderDetalle(m.id); },
    'Próxima visita', () => renderDetalle(m.id));
  const editarHorario = h => startWizard([pasoHorario(true, m.institucion)],
    h ? { ...h, detalleHorario: h.detalle } : { institucion: [m.institucion, m.direccion].filter(Boolean).join(', ') },
    v => {
      const nuevo = horarioDe({ ...v, id: h && h.id });
      m.horarios = h ? m.horarios.map(x => (x.id === h.id ? nuevo : x)) : [...(m.horarios || []), nuevo];
      m.actualizado = ahora(); save(); toast('Horario guardado.'); renderDetalle(m.id);
    }, h ? 'Editar horario' : 'Nuevo horario', () => renderDetalle(m.id));
  $('#btn-hor').onclick = () => editarHorario(null);
  view.querySelectorAll('[data-hor-edit]').forEach(b => (b.onclick = () => editarHorario(m.horarios.find(x => x.id === b.dataset.horEdit))));
  view.querySelectorAll('[data-hor-del]').forEach(b => (b.onclick = () => {
    if (!confirm('¿Borrar este horario?')) return;
    m.horarios = m.horarios.map(x => (x.id === b.dataset.horDel ? { id: x.id, borrado: true, actualizado: ahora() } : x));
    m.actualizado = ahora(); save(); renderDetalle(m.id);
  }));
  $('#btn-editar').onclick = () => renderEditar(m.id);
  if ($('#btn-editar2')) $('#btn-editar2').onclick = () => renderEditar(m.id);
  view.querySelectorAll('[data-pac]').forEach(b => (b.onclick = () => renderDetallePaciente(b.dataset.pac, () => renderDetalle(m.id))));
  $('#btn-borrar').onclick = () => {
    if (confirm(`¿Eliminar a ${m.nombre} y todo su historial? Esta acción no se puede deshacer.`)) {
      // Se conserva una marca de borrado para que la eliminación llegue a los demás dispositivos.
      marcarBorrado(m, 'visitas');
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
    cambiar(m, nuevo); save(); toast('Datos actualizados.'); renderDetalle(id);
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
    const r = await fetch('logo.jpg');
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
  const { doc, y, pageW } = await nuevoPDF('landscape', 'Registro de visitas a médicos', descripcionFiltros(f));

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
    headStyles: { fillColor: [10, 31, 99], textColor: 255, halign: 'center', fontSize: 8 },
    footStyles: { fillColor: [225, 236, 252], textColor: 20, fontStyle: 'bold' },
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

  await entregarPDF(doc, `alveon-visitas-${hoy()}.pdf`, 'Registro de visitas – Alveon');
}

/* Crea un PDF A4 con el encabezado de Alveon. Devuelve el documento y la altura donde continuar. */
async function nuevoPDF(orientacion, subtitulo, descripcion) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: orientacion, unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let x = 14;
  const logo = await cargarLogo();
  if (logo) {
    let h = 16, w = (logo.w / logo.h) * h;
    if (w > 45) { w = 45; h = (logo.h / logo.w) * w; }
    doc.addImage(logo.url, 'JPEG', 14, 7, w, h);
    x = 14 + w + 5;
  }
  doc.setFontSize(16); doc.setTextColor(10, 31, 99);
  doc.text('Alveon – Oxigenoterapia', x, 15);
  doc.setFontSize(11); doc.setTextColor(60);
  doc.text(subtitulo, x, 21.5);
  doc.setFontSize(9);
  doc.text(`Fecha de emisión: ${fmtFecha(hoy())}`, pageW - 14, 15, { align: 'right' });
  if (db.config.representante) doc.text(`Representante: ${db.config.representante}`, pageW - 14, 21.5, { align: 'right' });
  let y = 27;
  if (descripcion) {
    doc.setTextColor(90);
    const lineas = doc.splitTextToSize(descripcion, pageW - 28);
    doc.text(lineas, 14, y); y += 3 + (lineas.length - 1) * 4;
  }
  return { doc, y, pageW };
}

/* En el celular ofrece compartir (WhatsApp, correo, Drive); si no está disponible, descarga el archivo. */
async function entregarPDF(doc, nombre, titulo) {
  const blob = doc.output('blob');
  const file = new File([blob], nombre, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: titulo }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  descargar(blob, nombre);
  toast('PDF generado.');
}

/* Número de página al pie. */
function piePagina(doc, nota) {
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Página ${doc.internal.getNumberOfPages()}`, w - 14, h - 8, { align: 'right' });
  if (nota) doc.text(nota, 14, h - 8);
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
      estadoSync('Esperando la autorización en la ventana de Google…');
      await Drive.autorizar(clientId(), !local.driveConectado);
      estadoSync('Autorización recibida.');
    }
    const respaldo = local.ultimoRespaldo !== hoy() ? hoy() : null;
    const datos = await Drive.sincronizar(db, combinar, respaldo, estadoSync);
    db = normalizar(datos);
    escribir(STORAGE_KEY, db);
    Object.assign(local, { driveConectado: true, ultimaSync: ahora(), pendiente: false });
    if (respaldo) local.ultimoRespaldo = respaldo;
    guardarLocal();
    estadoSync('');
    if (interactivo) toast('Datos sincronizados con Google Drive.');
    refrescarVista();
  } catch (e) {
    const msg = e.message || 'No se pudo sincronizar.';
    estadoSync(msg, true);
    if (interactivo) toast(msg, 8000);
  } finally {
    sincronizando = false; pintarNube();
  }
}

let refrescarVista = () => irInicio();

/* ---------- Conexión alternativa (sin ventana emergente) ---------- */
const direccionRetorno = () => new URL('index.html', location.href.split('#')[0].split('?')[0]).href;
function conectarPorRedireccion() {
  if (!clientId()) { toast('Primero ingrese el ID de cliente de Google.'); return; }
  const estado = uid();
  try { sessionStorage.setItem('alveon-oauth-estado', estado); } catch (_) { /* sin almacenamiento */ }
  location.href = Drive.urlRedireccion(clientId(), direccionRetorno(), estado);
}
// Al volver de Google: toma el permiso de la dirección, la limpia y sincroniza.
function procesarRetornoGoogle() {
  let estado = '';
  try { estado = sessionStorage.getItem('alveon-oauth-estado') || ''; } catch (_) { /* sin almacenamiento */ }
  const r = Drive.leerRedireccion(location.hash, estado);
  if (!r) return false;
  try { sessionStorage.removeItem('alveon-oauth-estado'); } catch (_) { /* sin almacenamiento */ }
  history.replaceState(null, '', location.pathname + location.search);
  renderAjustes();
  if (r.error) { estadoSync(r.error, true); toast(r.error, 8000); return true; }
  refrescarVista = renderAjustes;
  sincronizar(true).then(() => { refrescarVista = irInicio; renderAjustes(); });
  return true;
}
// Autorización que llega tarde por la ventana emergente (después del aviso falso de "ventana cerrada").
window.addEventListener('drive-token', () => {
  refrescarVista = $('#sync-estado') ? renderAjustes : irInicio;
  sincronizar(true).then(() => { refrescarVista = irInicio; });
});
window.addEventListener('drive-error', e => { estadoSync(e.detail, true); toast(e.detail, 8000); });

/* Muestra en Ajustes el paso actual de la sincronización o el último error (queda visible hasta resolverlo). */
let ultimoEstadoSync = { texto: '', error: false };
function estadoSync(texto, error = false) {
  ultimoEstadoSync = { texto, error };
  const el = $('#sync-estado');
  if (el) { el.textContent = texto; el.className = 'sync-estado' + (error ? ' error' : '') + (texto ? '' : ' vacio'); }
}

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
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); eventoInstalar = e; if ($('#btn-nuevo')) irInicio(); });
window.addEventListener('appinstalled', () => { eventoInstalar = null; toast('Aplicación instalada.'); });

function bannerInstalar() {
  if (instalada() || !eventoInstalar) return '';
  return `<div class="card banner"><span>Instale la aplicación en este dispositivo para abrirla con un toque.</span>
    <button class="btn primary" id="btn-instalar">Instalar</button></div>`;
}
function conectarInstalar() {
  const b = $('#btn-instalar');
  if (b) b.onclick = async () => { eventoInstalar.prompt(); await eventoInstalar.userChoice; eventoInstalar = null; irInicio(); };
}

/* ---------- Ajustes ---------- */
function renderAjustes() {
  setHeader('Ajustes', () => irInicio());
  const cidFijo = !!(window.ALVEON_CONFIG || {}).googleClientId;
  view.innerHTML = `
    <form class="card" id="fcfg">
      <h2>Datos generales</h2>
      <div class="form-row"><label for="c-rep">Nombre del representante (aparece en el PDF)</label>
        <input class="field" id="c-rep" value="${esc(db.config.representante)}"></div>
      <div class="form-row"><label for="c-frec">Frecuencia de visita deseada (días)</label>
        <input class="field" id="c-frec" type="number" inputmode="numeric" min="1" value="${esc(frecuencia())}"></div>
      <h2 style="margin-top:18px">Pacientes</h2>
      <div class="form-row"><label for="c-fpac">Frecuencia de control de pacientes (días)</label>
        <input class="field" id="c-fpac" type="number" inputmode="numeric" min="1" value="${esc(db.config.frecControlPac)}"></div>
      <p class="hint">Intervalos de mantenimiento: ajústelos según el manual del fabricante de cada equipo.</p>
      <div class="grid2">
        <div class="form-row"><label for="c-mdc">Concentrador: cada (días)</label>
          <input class="field" id="c-mdc" type="number" inputmode="numeric" min="1" value="${esc(db.config.mantDiasConc)}"></div>
        <div class="form-row"><label for="c-mhc">o cada (horas de uso)</label>
          <input class="field" id="c-mhc" type="number" inputmode="numeric" min="0" value="${esc(db.config.mantHorasConc)}"></div>
      </div>
      <div class="form-row"><label for="c-mdp">CPAP: servicio cada (días)</label>
        <input class="field" id="c-mdp" type="number" inputmode="numeric" min="1" value="${esc(db.config.mantDiasCpap)}"></div>
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
      <p id="sync-estado" class="sync-estado${ultimoEstadoSync.error ? ' error' : ''}${ultimoEstadoSync.texto ? '' : ' vacio'}" role="status">${esc(ultimoEstadoSync.texto)}</p>
      <div class="actions">
        <button class="btn primary" id="c-sync">${local.driveConectado ? 'Sincronizar ahora' : 'Conectar Google Drive'}</button>
        ${local.driveConectado ? '<button class="btn danger" id="c-desc">Desconectar</button>' : '<button class="btn" id="c-redir">Conectar con otro método</button>'}
      </div>
      ${local.driveConectado ? '' : `<p class="hint">"Conectar con otro método" no usa ventana emergente: la página va a Google y vuelve. Requiere agregar
        <b>${esc(direccionRetorno())}</b> en "URI de redireccionamiento autorizados" del ID de cliente en Google Cloud.</p>`}
    </div>

    <div class="card">
      <h2>Instalar en otros dispositivos</h2>
      <p class="hint">Abra la página de instalación para ver el enlace, un código QR para el celular y las instrucciones para cada equipo.</p>
      ${eventoInstalar && !instalada() ? '<button class="btn primary" id="c-inst" style="margin-bottom:10px">Instalar en este dispositivo</button>' : ''}
      <a class="btn" href="instalar.html">Página de instalación</a>
    </div>

    <div class="card">
      <h2>Copia de seguridad manual</h2>
      <p class="hint">Archivo JSON con todos los datos (médicos y pacientes), para guardar o pasar a otro equipo.</p>
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
    db.config.frecControlPac = Math.max(1, parseInt($('#c-fpac').value, 10) || 30);
    db.config.mantDiasConc = Math.max(1, parseInt($('#c-mdc').value, 10) || 180);
    db.config.mantHorasConc = Math.max(0, parseInt($('#c-mhc').value, 10) || 0);
    db.config.mantDiasCpap = Math.max(1, parseInt($('#c-mdp').value, 10) || 180);
    db.config.actualizado = ahora();
    save(); toast('Ajustes guardados.'); irInicio();
  };
  $('#c-sync').onclick = async () => {
    if ($('#c-cid')) { local.clientId = $('#c-cid').value.trim(); guardarLocal(); }
    if (!clientId()) { toast('Primero ingrese el ID de cliente de Google.'); return; }
    refrescarVista = renderAjustes;
    await sincronizar(true);
    refrescarVista = irInicio;
    renderAjustes();
  };
  if ($('#c-redir')) $('#c-redir').onclick = conectarPorRedireccion;
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
      save(); toast('Copia importada.'); irInicio();
    } catch (_) { toast('El archivo no es una copia válida.'); }
  };
}

function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* El inicio de la aplicación está en main.js. */
