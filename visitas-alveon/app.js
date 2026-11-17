/* Visitas Alveon – registro de visitas a médicos (oxigenoterapia).
   Los datos se guardan en el propio dispositivo (localStorage). */
'use strict';

const STORAGE_KEY = 'alveon-visitas-v1';
const ESPECIALIDADES = ['Neumonología', 'Clínica médica', 'Cardiología', 'Geriatría',
  'Medicina familiar', 'Pediatría', 'Terapia intensiva', 'Cuidados paliativos', 'Kinesiología'];

/* ---------- Datos ---------- */
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (d && Array.isArray(d.medicos)) return d;
  } catch (_) { /* sin datos o almacenamiento bloqueado */ }
  return { medicos: [], config: { representante: '', frecuenciaDias: 30 } };
}
let db = load();
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
  catch (_) { toast('No se pudo guardar en este dispositivo.'); }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const findMedico = id => db.medicos.find(m => m.id === id);

function ultimaVisita(m) {
  return m.visitas.reduce((max, v) => (v.fecha > max ? v.fecha : max), '');
}
function pacientesTotal(m) {
  // El total vigente es el informado en la visita más reciente.
  const v = [...m.visitas].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  return v ? Number(v.pacientes) || 0 : 0;
}

/* ---------- Utilidades ---------- */
const $ = sel => document.querySelector(sel);
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtFecha = iso => (iso ? iso.split('-').reverse().join('/') : '—');
function diasDesde(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((t - new Date(y, m - 1, d)) / 86400000);
}
const soloDigitos = s => String(s || '').replace(/\D/g, '');
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
function setHeader(title, back) {
  $('#title').textContent = title;
  $('#btn-back').hidden = !back;
  $('#btn-back').onclick = back || null;
  window.scrollTo(0, 0);
}

/* ---------- Pantalla principal ---------- */
function renderHome(filtro = '') {
  setHeader('Visitas a médicos', null);
  const frec = Number(db.config.frecuenciaDias) || 30;
  const q = filtro.trim().toLowerCase();
  const lista = db.medicos
    .filter(m => !q || [m.nombre, m.institucion, m.ubicacion, m.especialidad].join(' ').toLowerCase().includes(q))
    .sort((a, b) => ultimaVisita(a).localeCompare(ultimaVisita(b))); // primero los que hace más tiempo no se visitan

  const totalPac = db.medicos.reduce((s, m) => s + pacientesTotal(m), 0);
  const pendientes = db.medicos.filter(m => (diasDesde(ultimaVisita(m)) ?? 9999) >= frec).length;

  view.innerHTML = `
    <div class="actions">
      <button class="btn primary" id="btn-nuevo">+ Nuevo médico</button>
      <button class="btn" id="btn-pdf" ${db.medicos.length ? '' : 'disabled'}>Generar PDF</button>
    </div>
    ${db.medicos.length ? `
      <input class="search" id="buscar" type="search" placeholder="Buscar por nombre, institución o zona" value="${esc(filtro)}">
      <div class="summary">
        <span>${db.medicos.length} médico(s) · ${totalPac} paciente(s) referido(s)</span>
        <span>${pendientes} para visitar</span>
      </div>
      ${lista.map(itemMedico).join('') || '<div class="empty">Sin resultados.</div>'}
    ` : `<div class="empty">Todavía no hay médicos cargados.<br>Toque <b>+ Nuevo médico</b> para comenzar.</div>`}
  `;
  $('#btn-nuevo').onclick = () => startWizard(pasosNuevoMedico(), {}, guardarNuevoMedico, 'Nuevo médico');
  $('#btn-pdf').onclick = generarPDF;
  const b = $('#buscar');
  if (b) {
    b.oninput = () => { const pos = b.selectionStart; renderHome(b.value); const nb = $('#buscar'); nb.focus(); nb.setSelectionRange(pos, pos); };
  }
  view.querySelectorAll('.doc-item').forEach(el => (el.onclick = () => renderDetalle(el.dataset.id)));
}

function itemMedico(m) {
  const frec = Number(db.config.frecuenciaDias) || 30;
  const uv = ultimaVisita(m);
  const d = diasDesde(uv);
  let cls = '', txt = d === null ? 'Sin visitas' : d === 0 ? 'Hoy' : `Hace ${d} d`;
  if (d === null || d >= frec) cls = 'late'; else if (d >= frec * 0.75) cls = 'warn';
  return `
    <button class="doc-item" data-id="${m.id}">
      <div class="info">
        <div class="name">${esc(m.nombre)}</div>
        <div class="sub">${esc(m.institucion)}${m.ubicacion ? ' · ' + esc(m.ubicacion) : ''}</div>
        <div style="margin-top:6px"><span class="pill ${cls}">${txt}</span></div>
      </div>
      <div class="count"><b>${pacientesTotal(m)}</b><small>pacientes</small></div>
    </button>`;
}

/* ---------- Asistente paso a paso ---------- */
function opcionesInstituciones() {
  return [...new Set(db.medicos.map(m => m.institucion).filter(Boolean))];
}

function pasosNuevoMedico() {
  return [
    { key: 'nombre', q: '¿Cuál es el nombre del médico?', hint: 'Por ejemplo: Dra. María López', type: 'text', required: true, autocomplete: 'off' },
    { key: 'especialidad', q: '¿Cuál es su especialidad?', hint: 'Opcional. Puede elegir una opción o escribirla.', type: 'text', chips: ESPECIALIDADES },
    { key: 'institucion', q: '¿En qué institución atiende?', hint: 'Hospital, clínica, sanatorio o consultorio.', type: 'text', required: true, chips: opcionesInstituciones() },
    { key: 'ubicacion', q: '¿Dónde se encuentra?', hint: 'Dirección, localidad o zona.', type: 'text', required: true },
    { key: 'celular', q: 'Número de celular para WhatsApp', hint: 'Se solicita una única vez. Incluya código de país y de área, por ejemplo: +54 9 11 1234 5678. Puede dejarlo vacío.', type: 'tel', validate: v => !v || soloDigitos(v).length >= 8 || 'El número parece incompleto.' },
    { key: 'fecha', q: '¿Cuál fue la fecha de la última visita?', type: 'date', required: true, def: hoy(), validate: v => v <= hoy() || 'La fecha no puede ser futura.' },
    { key: 'pacientes', q: '¿Cuántos pacientes refirió a su servicio hasta ahora?', hint: 'Total acumulado.', type: 'number', def: 0 },
    { key: 'notas', q: 'Notas de la visita', hint: 'Opcional: temas conversados, material entregado, próximos pasos.', type: 'textarea' }
  ];
}

function pasosVisita(m) {
  return [
    { key: 'fecha', q: `Fecha de la visita a ${m.nombre}`, type: 'date', required: true, def: hoy(), validate: v => v <= hoy() || 'La fecha no puede ser futura.' },
    { key: 'pacientes', q: '¿Cuántos pacientes refirió hasta ahora?', hint: `Total acumulado. Valor anterior: ${pacientesTotal(m)}.`, type: 'number', def: pacientesTotal(m) },
    { key: 'notas', q: 'Notas de la visita', hint: 'Opcional.', type: 'textarea' }
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
    if (p.type === 'number') return `
      <div class="stepper">
        <button class="btn" type="button" id="menos" aria-label="Restar">−</button>
        <input class="field" id="inp" type="number" inputmode="numeric" min="0" step="1" value="${val}">
        <button class="btn" type="button" id="mas" aria-label="Sumar">+</button>
      </div>`;
    const extra = p.type === 'tel' ? 'inputmode="tel" autocomplete="tel"' : 'autocomplete="off" autocapitalize="words"';
    return `<input class="field" id="inp" type="${p.type}" ${p.type === 'date' ? `max="${hoy()}"` : extra} value="${val}">`;
  }

  function paso() {
    const p = pasos[i];
    setHeader(titulo, () => (i > 0 ? (guardarValor(), i--, paso()) : salir()));
    view.innerHTML = `
      <div class="progress"><span style="width:${((i + 1) / pasos.length) * 100}%"></span></div>
      <div class="step-count">Paso ${i + 1} de ${pasos.length}</div>
      <form id="wform" class="card" novalidate>
        <p class="question">${esc(p.q)}${p.required ? '' : ' <span class="hint">(opcional)</span>'}</p>
        ${p.hint ? `<p class="hint">${esc(p.hint)}</p>` : ''}
        ${campo(p, valores[p.key])}
        ${p.chips && p.chips.length ? `<div class="chips">${p.chips.map(c => `<button type="button" class="chip">${esc(c)}</button>`).join('')}</div>` : ''}
        <div class="error" id="err"></div>
        <div class="wizard-nav">
          <button type="button" class="btn" id="atras">${i === 0 ? 'Cancelar' : 'Atrás'}</button>
          <button type="submit" class="btn primary">${i === pasos.length - 1 ? 'Revisar' : 'Siguiente'}</button>
        </div>
      </form>`;
    const inp = $('#inp');
    if (p.type !== 'date') setTimeout(() => inp.focus(), 50);
    if (p.type === 'number') {
      $('#menos').onclick = () => (inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) - 1));
      $('#mas').onclick = () => (inp.value = (parseInt(inp.value, 10) || 0) + 1);
    }
    view.querySelectorAll('.chip').forEach(c => (c.onclick = () => { inp.value = c.textContent; inp.focus(); }));
    $('#atras').onclick = () => (i === 0 ? salir() : (guardarValor(), i--, paso()));
    $('#wform').onsubmit = e => {
      e.preventDefault();
      const v = guardarValor();
      let err = '';
      if (p.required && (v === '' || v == null)) err = 'Este dato es obligatorio.';
      else if (p.type === 'number' && (!Number.isInteger(v) || v < 0)) err = 'Ingrese un número entero igual o mayor a 0.';
      else if (p.validate) { const r = p.validate(v); if (r !== true) err = r; }
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

  function mostrar(p, v) {
    if (p.type === 'date') return fmtFecha(v);
    return v === '' || v == null ? '—' : esc(v);
  }

  function resumen() {
    setHeader(titulo, () => paso());
    view.innerHTML = `
      <div class="card">
        <h2>Revise los datos</h2>
        ${pasos.map((p, k) => `
          <div class="label">${esc(p.q.replace(/^¿|\?$/g, ''))}</div>
          <div class="value" style="display:flex;justify-content:space-between;gap:8px">
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
    ubicacion: v.ubicacion, celular: v.celular || '',
    creado: new Date().toISOString(),
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
  const visitas = [...m.visitas].sort((a, b) => b.fecha.localeCompare(a.fecha));
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
      <div class="label">Institución</div><div class="value">${esc(m.institucion)}</div>
      <div class="label">Ubicación</div><div class="value">${esc(m.ubicacion) || '—'}</div>
      <div class="label">Especialidad</div><div class="value">${esc(m.especialidad) || '—'}</div>
      <div class="label">Celular (WhatsApp)</div><div class="value">${esc(m.celular) || '—'}</div>
    </div>
    <div class="card">
      <h2>Historial de visitas (${visitas.length})</h2>
      ${visitas.map(v => `
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
    save(); toast('Visita registrada.'); renderDetalle(m.id);
  }, 'Nueva visita', () => renderDetalle(m.id));
  $('#btn-editar').onclick = () => renderEditar(m.id);
  if ($('#btn-editar2')) $('#btn-editar2').onclick = () => renderEditar(m.id);
  $('#btn-borrar').onclick = () => {
    if (confirm(`¿Eliminar a ${m.nombre} y todo su historial? Esta acción no se puede deshacer.`)) {
      db.medicos = db.medicos.filter(x => x.id !== m.id); save(); toast('Médico eliminado.'); renderHome();
    }
  };
}

function renderEditar(id) {
  const m = findMedico(id);
  setHeader('Editar datos', () => renderDetalle(id));
  const campos = [
    ['nombre', 'Nombre', 'text'], ['especialidad', 'Especialidad', 'text'],
    ['institucion', 'Institución', 'text'], ['ubicacion', 'Ubicación', 'text'],
    ['celular', 'Celular (WhatsApp)', 'tel']
  ];
  view.innerHTML = `
    <form class="card" id="fedit">
      ${campos.map(([k, l, t]) => `
        <div class="form-row"><label for="e-${k}">${l}</label>
        <input class="field" id="e-${k}" type="${t}" value="${esc(m[k])}" ${t === 'tel' ? 'inputmode="tel"' : ''}></div>`).join('')}
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
    Object.assign(m, nuevo); save(); toast('Datos actualizados.'); renderDetalle(id);
  };
}

/* ---------- Ajustes y respaldo ---------- */
function renderAjustes() {
  setHeader('Ajustes', () => renderHome());
  view.innerHTML = `
    <form class="card" id="fcfg">
      <div class="form-row"><label for="c-rep">Nombre del representante (aparece en el PDF)</label>
        <input class="field" id="c-rep" value="${esc(db.config.representante)}"></div>
      <div class="form-row"><label for="c-frec">Frecuencia de visita deseada (días)</label>
        <input class="field" id="c-frec" type="number" inputmode="numeric" min="1" value="${esc(db.config.frecuenciaDias || 30)}"></div>
      <button class="btn primary" type="submit">Guardar ajustes</button>
    </form>
    <div class="card">
      <h2>Copia de seguridad</h2>
      <p class="hint">Los datos se guardan sólo en este dispositivo y navegador. Descargue una copia periódicamente o úsela para pasar los datos a otro equipo.</p>
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
    save(); toast('Ajustes guardados.'); renderHome();
  };
  $('#exp').onclick = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    descargar(blob, `alveon-visitas-respaldo-${hoy()}.json`);
  };
  $('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || !Array.isArray(d.medicos)) throw new Error();
      if (!confirm(`Se reemplazarán los datos actuales por ${d.medicos.length} médico(s) del archivo. ¿Continuar?`)) return;
      db = { medicos: d.medicos, config: { representante: '', frecuenciaDias: 30, ...(d.config || {}) } };
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

/* ---------- PDF ---------- */
async function generarPDF() {
  if (!window.jspdf) { toast('No se pudo cargar el generador de PDF.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  const filas = [...db.medicos]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map(m => [m.nombre, m.institucion, fmtFecha(ultimaVisita(m)), String(pacientesTotal(m)),
      m.ubicacion || '', m.especialidad || '', m.celular || '']);
  const total = db.medicos.reduce((s, m) => s + pacientesTotal(m), 0);

  doc.setFontSize(16); doc.setTextColor(11, 110, 138);
  doc.text('Alveon – Oxigenoterapia', 14, 16);
  doc.setFontSize(11); doc.setTextColor(60);
  doc.text('Registro de visitas a médicos', 14, 23);
  doc.setFontSize(9);
  const linea = `Fecha de emisión: ${fmtFecha(hoy())}` + (db.config.representante ? `   ·   Representante: ${db.config.representante}` : '');
  doc.text(linea, pageW - 14, 23, { align: 'right' });

  doc.autoTable({
    startY: 28,
    head: [['Nombre', 'Institución', 'Fecha última visita', 'Pacientes referidos', 'Ubicación', 'Especialidad', 'Celular (WhatsApp)']],
    body: filas,
    foot: [['Total', '', '', String(total), '', '', '']],
    showFoot: 'lastPage',
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5, valign: 'middle' },
    headStyles: { fillColor: [11, 110, 138], textColor: 255, halign: 'center' },
    footStyles: { fillColor: [230, 240, 244], textColor: 20, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 248, 250] },
    columnStyles: { 2: { halign: 'center', cellWidth: 28 }, 3: { halign: 'center', cellWidth: 26 }, 6: { cellWidth: 36 } },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageW - 14, h - 8, { align: 'right' });
    }
  });

  const nombre = `alveon-visitas-${hoy()}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], nombre, { type: 'application/pdf' });
  // En el celular se ofrece compartir (WhatsApp, correo, Drive); si no está disponible, se descarga.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Registro de visitas – Alveon' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  descargar(blob, nombre);
  toast('PDF generado.');
}

/* ---------- Inicio ---------- */
$('#btn-settings').onclick = renderAjustes;
renderHome();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
