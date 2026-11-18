/* Alveon B2B – seguimiento comercial de obras sociales, hospitales, sanatorios, clínicas y otros prestadores.
   Núcleo: datos, utilidades, formularios, correo y WhatsApp, sincronización con Google Drive y ajustes.
   Los datos se guardan en el dispositivo y, opcionalmente, se sincronizan con Google Drive. */
'use strict';

const STORAGE_KEY = 'alveon-b2b-v1';
const LOCAL_KEY = 'alveon-b2b-local-v1'; // ajustes propios de cada dispositivo (no se sincronizan)

const TIPOS_CUENTA = ['Obra social', 'Prepaga', 'Hospital público', 'Hospital privado', 'Sanatorio', 'Clínica',
  'Internación domiciliaria', 'Centro de rehabilitación', 'Geriátrico / residencia', 'Centro de diagnóstico',
  'Distribuidor / proveedor', 'Otro'];
const ETAPAS = [
  ['prospecto', 'Prospecto'], ['contacto', 'Contacto inicial'], ['reunion', 'Reuniones'],
  ['propuesta', 'Propuesta técnico-económica'], ['licitacion', 'Licitación'], ['negociacion', 'Negociación'],
  ['cliente', 'Cliente'], ['perdida', 'Perdida / sin interés']
];
const ROLES = [['decisor', 'Decisor'], ['influye', 'Influye en la decisión'], ['no', 'No decide']];
const CARGOS = ['Director médico', 'Gerente general', 'Gerente de prestaciones', 'Jefe de compras', 'Auditor médico',
  'Jefe de neumonología', 'Jefe de enfermería', 'Ingeniería clínica', 'Farmacia', 'Administración', 'Secretaría'];
const PRODUCTOS_BASE = ['Concentrador de oxígeno estacionario', 'Concentrador de oxígeno portátil', 'CPAP', 'BiPAP / VNI',
  'Insumos y accesorios', 'Servicio domiciliario', 'Servicio técnico y mantenimiento'];
const PROVINCIAS = ['Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes',
  'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén',
  'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero',
  'Tierra del Fuego', 'Tucumán'];
const MONEDAS = ['ARS', 'USD'];
const REMITENTE_BASE = 'cotizaciones.alveon@gmail.com';
const VERSION = '1.4 (18/11/2026)';

/* Tipos de actividad. "etapa": etapa comercial a la que avanza la cuenta al registrarla.
   "campos": datos propios del tipo (además de fecha, contactos, detalle y seguimiento). */
const C_PRODUCTOS = { k: 'productos', l: 'Productos', t: 'multi', opsFn: () => productos() };
const C_MONTO = { k: 'monto', l: 'Monto total', t: 'number' };
const C_MONEDA = { k: 'moneda', l: 'Moneda', t: 'choice', ops: MONEDAS, def: 'ARS' };
const TIPOS_ACT = {
  contacto: { l: 'Contacto inicial', etapa: 'contacto', campos: [
    { k: 'canal', l: 'Canal', t: 'choice', ops: ['Presencial', 'Teléfono', 'Correo', 'WhatsApp', 'Congreso / evento', 'Referido'] }] },
  reunion: { l: 'Reunión', etapa: 'reunion', campos: [
    { k: 'modalidad', l: 'Modalidad', t: 'choice', ops: ['Presencial', 'Virtual', 'Telefónica'] },
    { k: 'lugar', l: 'Lugar o enlace', t: 'text' },
    { k: 'resultado', l: 'Resultado', t: 'choice', ops: ['Positivo', 'Neutro', 'Negativo'] }] },
  propuesta: { l: 'Propuesta técnico-económica', etapa: 'propuesta', campos: [
    { k: 'numero', l: 'Número o referencia', t: 'text' }, C_PRODUCTOS, C_MONTO, C_MONEDA,
    { k: 'validez', l: 'Válida hasta', t: 'date' },
    { k: 'estado', l: 'Estado', t: 'choice', ops: ['Enviada', 'En evaluación', 'Aceptada', 'Rechazada'], def: 'Enviada' }] },
  licitacion: { l: 'Licitación', etapa: 'licitacion', campos: [
    { k: 'numero', l: 'Número o expediente', t: 'text' },
    { k: 'modalidad', l: 'Tipo', t: 'choice', ops: ['Pública', 'Privada', 'Concurso de precios', 'Contratación directa'] },
    C_PRODUCTOS, { k: 'apertura', l: 'Fecha de apertura', t: 'date' }, C_MONTO, C_MONEDA,
    { k: 'estado', l: 'Estado', t: 'choice', ops: ['En preparación', 'Presentada', 'Preadjudicada', 'Adjudicada', 'No adjudicada', 'Desierta'], def: 'En preparación' }] },
  venta: { l: 'Venta', etapa: 'cliente', campos: [
    C_PRODUCTOS, { k: 'cantidad', l: 'Cantidad de unidades', t: 'number' }, C_MONTO, C_MONEDA,
    { k: 'comprobante', l: 'Orden de compra o factura', t: 'text' }] },
  alquiler: { l: 'Alquiler', etapa: 'cliente', campos: [
    C_PRODUCTOS, { k: 'cantidad', l: 'Cantidad de unidades', t: 'number' },
    { k: 'monto', l: 'Cuota mensual', t: 'number' }, C_MONEDA,
    { k: 'inicio', l: 'Inicio del contrato', t: 'date' }, { k: 'fin', l: 'Fin del contrato', t: 'date' },
    { k: 'comprobante', l: 'Contrato u orden de compra', t: 'text' }] },
  garantia: { l: 'Garantía', campos: [
    { k: 'equipo', l: 'Equipo', t: 'text', sugFn: () => productos() }, { k: 'serie', l: 'Número de serie', t: 'text' },
    { k: 'vence', l: 'Vencimiento de la garantía', t: 'date' },
    { k: 'estado', l: 'Estado', t: 'choice', ops: ['Vigente', 'Reclamo en curso', 'Cerrada'], def: 'Vigente' }] },
  soporte: { l: 'Soporte técnico', campos: [
    { k: 'equipo', l: 'Equipo', t: 'text', sugFn: () => productos() }, { k: 'serie', l: 'Número de serie', t: 'text' },
    { k: 'estado', l: 'Estado', t: 'choice', ops: ['Abierto', 'En curso', 'Resuelto'], def: 'Abierto' }] },
  consulta: { l: 'Consulta', campos: [
    { k: 'tema', l: 'Tema', t: 'text' },
    { k: 'estado', l: 'Estado', t: 'choice', ops: ['Pendiente', 'Respondida'], def: 'Pendiente' }] },
  llamada: { l: 'Llamada', campos: [] },
  email: { l: 'Correo', campos: [{ k: 'asunto', l: 'Asunto', t: 'text' }] },
  whatsapp: { l: 'WhatsApp', campos: [] },
  difusion: { l: 'Difusión masiva', campos: [
    { k: 'canal', l: 'Canal', t: 'choice', ops: ['Correo', 'WhatsApp'] }, { k: 'asunto', l: 'Asunto', t: 'text' }] },
  otra: { l: 'Otra', campos: [] }
};
// Estados que indican que una actividad sigue abierta (para la agenda).
const ABIERTOS = ['Enviada', 'En evaluación', 'En preparación', 'Presentada', 'Preadjudicada', 'Abierto', 'En curso', 'Pendiente', 'Reclamo en curso'];

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
  representante: '', remitente: REMITENTE_BASE, firma: 'Alveon\ncotizaciones.alveon@gmail.com',
  productos: PRODUCTOS_BASE.slice(), actualizado: ''
};

function normalizar(d) {
  const base = { cuentas: [], config: { ...CONFIG_BASE, productos: PRODUCTOS_BASE.slice() } };
  if (!d || !Array.isArray(d.cuentas)) return base;
  d.config = { ...CONFIG_BASE, ...(d.config || {}) };
  if (!Array.isArray(d.config.productos) || !d.config.productos.length) d.config.productos = PRODUCTOS_BASE.slice();
  d.cuentas.forEach(c => {
    c.actualizado = c.actualizado || c.creado || '';
    c.etapa = c.etapa || 'prospecto';
    c.interes = Array.isArray(c.interes) ? c.interes : [];
    c.contactos = (c.contactos || []).map(x => ({ ...x, id: x.id || uid(), actualizado: x.actualizado || c.actualizado }));
    c.actividades = (c.actividades || []).map(x => ({ ...x, id: x.id || uid(), datos: x.datos || {}, contactos: x.contactos || [], actualizado: x.actualizado || c.actualizado }));
  });
  return d;
}

let db = normalizar(leer(STORAGE_KEY));
let local = {
  clientId: '', driveConectado: false, ultimaSync: '', ultimoRespaldo: '', pendiente: false,
  modoCorreo: /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'app' : 'gmail',
  ...(leer(LOCAL_KEY) || {})
};
const guardarLocal = () => escribir(LOCAL_KEY, local);

function save() {
  if (!escribir(STORAGE_KEY, db)) toast('No se pudo guardar en este dispositivo.');
  if (local.driveConectado) { local.pendiente = true; guardarLocal(); programarSync(); }
  pintarNube();
}

const cuentas = () => db.cuentas.filter(c => !c.borrado);
const findCuenta = id => db.cuentas.find(c => c.id === id && !c.borrado);
const contactosDe = c => (c.contactos || []).filter(x => !x.borrado);
const actividadesDe = c => (c.actividades || []).filter(x => !x.borrado).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.actualizado || '').localeCompare(a.actualizado || ''));
const tocar = x => (x.actualizado = ahora());
const productos = () => db.config.productos;

/* Combina dos copias de los datos (de distintos dispositivos).
   Por cuenta, contacto y actividad gana la versión modificada más recientemente. */
function combinar(a, b) {
  a = normalizar(JSON.parse(JSON.stringify(a)));
  b = normalizar(JSON.parse(JSON.stringify(b)));
  const config = (a.config.actualizado || '') >= (b.config.actualizado || '') ? a.config : b.config;
  const porId = (la, lb, fn) => {
    const mapa = new Map();
    for (const x of [...la, ...lb]) {
      const prev = mapa.get(x.id);
      mapa.set(x.id, !prev ? x : fn(prev, x));
    }
    return [...mapa.values()];
  };
  const masNuevo = (x, y) => ((y.actualizado || '') >= (x.actualizado || '') ? y : x);
  const cuentasComb = porId(a.cuentas, b.cuentas, (x, y) => {
    const n = masNuevo(x, y);
    return {
      ...n,
      contactos: porId(x.contactos, y.contactos, masNuevo),
      actividades: porId(x.actividades, y.actividades, masNuevo)
    };
  });
  return { cuentas: cuentasComb, config };
}

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
const etapaTxt = k => (ETAPAS.find(e => e[0] === k) || ['', k])[1];
const rolTxt = k => (ROLES.find(r => r[0] === k) || ['', ''])[1];
const tipoActTxt = k => (TIPOS_ACT[k] || { l: k }).l;
const fmtMonto = (n, moneda) => (n === '' || n == null || Number.isNaN(Number(n)) ? '' :
  `${moneda === 'USD' ? 'USD' : '$'} ${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`);
const emailValido = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
const ubicacionTexto = c => [c.direccion, c.ciudad, c.provincia].filter(Boolean).join(', ');

function toast(msg, accion, fn) {
  const t = $('#toast');
  t.innerHTML = esc(msg) + (accion ? ` <button type="button" class="toast-btn">${esc(accion)}</button>` : '');
  if (accion) t.querySelector('button').onclick = () => { t.classList.remove('show'); fn(); };
  t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), accion ? 9000 : 2000);
}

let seccion = 'cuentas';
const SECCIONES = { cuentas: () => renderCuentas(), agenda: () => renderAgenda(), difusion: () => renderDifusion(), informes: () => renderInformes() };
function irInicio() { return (SECCIONES[seccion] || SECCIONES.cuentas)(); }

function setHeader(title, back) {
  $('#title').textContent = title;
  $('#btn-back').hidden = !back;
  $('#btn-back').onclick = back || null;
  const nav = $('#bottom-nav');
  nav.hidden = !!back;
  document.body.classList.toggle('con-nav', !back);
  nav.querySelectorAll('[data-sec]').forEach(b => b.classList.toggle('on', b.dataset.sec === seccion));
  window.scrollTo(0, 0);
}

/* ---------- Formularios ----------
   Campo: { k, l, t (text|email|tel|number|date|select|choice|multi|textarea), req, ops | opsFn, def, hint, ph,
            sug | sugFn (sugerencias para escribir), validate(v, valores) -> true | 'mensaje' } */
const opcionesDe = c => (c.opsFn ? c.opsFn() : c.ops || []).map(o => (Array.isArray(o) ? o : [o, o]));

function campoHTML(c, v, pref = 'f') {
  const id = `${pref}-${c.k}`;
  const val = esc(v ?? '');
  let ctl;
  if (c.t === 'textarea') ctl = `<textarea class="field" id="${id}" placeholder="${esc(c.ph || '')}">${val}</textarea>`;
  else if (c.t === 'select') ctl = `<select class="field" id="${id}"><option value="">Seleccione…</option>${opcionesDe(c).map(([o, l]) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  else if (c.t === 'choice') ctl = `<div class="choice" data-choice="${id}">${opcionesDe(c).map(([o, l]) =>
    `<button type="button" class="${o === v ? 'on' : ''}" data-val="${esc(o)}" aria-pressed="${o === v}">${esc(l)}</button>`).join('')}</div>
    <input type="hidden" id="${id}" value="${val}">`;
  else if (c.t === 'multi') {
    const sel = Array.isArray(v) ? v : [];
    const ops = opcionesDe(c);
    sel.filter(s => !ops.some(o => o[0] === s)).forEach(s => ops.push([s, s])); // valores que ya no están en el catálogo
    ctl = `<div class="chips multi" data-multi="${id}">${ops.length ? ops.map(([o, l]) =>
      `<button type="button" class="chip ${sel.includes(o) ? 'on' : ''}" data-val="${esc(o)}" aria-pressed="${sel.includes(o)}">${esc(l)}</button>`).join('') : `<span class="hint">${esc(c.vacio || 'No hay opciones.')}</span>`}</div>
      <input type="hidden" id="${id}" value="${esc(JSON.stringify(sel))}">`;
  } else {
    const tipo = { email: 'email', tel: 'tel', number: 'number', date: 'date' }[c.t] || 'text';
    const extra = c.t === 'number' ? 'inputmode="decimal" min="0" step="any"' : c.t === 'tel' ? 'inputmode="tel" autocomplete="off"' :
      c.t === 'email' ? 'inputmode="email" autocapitalize="off" autocomplete="off"' : 'autocomplete="off" autocapitalize="sentences"';
    const sug = c.sugFn ? c.sugFn() : c.sug;
    ctl = `<input class="field" id="${id}" type="${tipo}" ${extra} value="${val}" placeholder="${esc(c.ph || '')}" ${sug ? `list="${id}-dl"` : ''}>
      ${sug ? `<datalist id="${id}-dl">${sug.map(s => `<option value="${esc(s)}">`).join('')}</datalist>` : ''}`;
  }
  return `<div class="form-row" data-campo="${id}">
    <label for="${id}">${esc(c.l)}${c.req ? '' : ' <span class="hint">(opcional)</span>'}</label>
    ${c.hint ? `<p class="hint small">${esc(c.hint)}</p>` : ''}
    ${ctl}
    <div class="error" id="${id}-err"></div>
  </div>`;
}

/* Conecta los botones de opción y de selección múltiple dentro de un contenedor. */
function conectarCampos(raiz) {
  raiz.querySelectorAll('[data-choice] button').forEach(b => (b.onclick = () => {
    const caja = b.closest('[data-choice]');
    const inp = document.getElementById(caja.dataset.choice);
    const ya = b.classList.contains('on');
    caja.querySelectorAll('button').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
    if (!ya) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); }
    inp.value = ya ? '' : b.dataset.val;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }));
  raiz.querySelectorAll('[data-multi] button').forEach(b => (b.onclick = () => {
    b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on'));
    const caja = b.closest('[data-multi]');
    document.getElementById(caja.dataset.multi).value = JSON.stringify([...caja.querySelectorAll('button.on')].map(x => x.dataset.val));
  }));
}

/* Lee y valida los campos. Devuelve los valores o null si hay errores (y los muestra). */
function leerCampos(campos, pref = 'f') {
  const v = {};
  campos.forEach(c => {
    const el = document.getElementById(`${pref}-${c.k}`);
    if (!el) return;
    if (c.t === 'multi') { try { v[c.k] = JSON.parse(el.value); } catch (_) { v[c.k] = []; } }
    else if (c.t === 'number') v[c.k] = el.value === '' ? '' : Number(el.value);
    else v[c.k] = el.value.trim();
  });
  let ok = true;
  campos.forEach(c => {
    const err = document.getElementById(`${pref}-${c.k}-err`);
    if (!err) return;
    const x = v[c.k];
    let m = '';
    if (c.req && (x === '' || x == null || (Array.isArray(x) && !x.length))) m = 'Este dato es obligatorio.';
    else if (c.t === 'email' && x && !emailValido(x)) m = 'El correo electrónico no es válido.';
    else if (c.t === 'tel' && x && soloDigitos(x).length < 8) m = 'El número parece incompleto.';
    else if (c.t === 'number' && x !== '' && (Number.isNaN(x) || x < 0)) m = 'Ingrese un número igual o mayor a 0.';
    else if (c.validate && x !== '' && x != null) { const r = c.validate(x, v); if (r !== true) m = r; }
    err.textContent = m;
    if (m && ok) { ok = false; document.getElementById(`${pref}-${c.k}`)?.closest('.form-row')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  });
  return ok ? v : null;
}

/* ---------- Correo y WhatsApp ---------- */
const remitente = () => (db.config.remitente || REMITENTE_BASE).trim();
const firma = () => db.config.firma || '';

/* Abre un correo nuevo.
   - Modo "gmail": Gmail en el navegador, con la cuenta del remitente (cotizaciones.alveon@gmail.com) ya iniciada.
   - Modo "app": la aplicación de correo del dispositivo (en el celular, Gmail permite elegir la cuenta remitente). */
function urlCorreo({ to = [], cc = [], bcc = [], asunto = '', cuerpo = '' }) {
  const lista = a => a.filter(Boolean).join(',');
  if (local.modoCorreo === 'app') {
    const p = [];
    if (cc.length) p.push('cc=' + encodeURIComponent(lista(cc)));
    if (bcc.length) p.push('bcc=' + encodeURIComponent(lista(bcc)));
    if (asunto) p.push('subject=' + encodeURIComponent(asunto));
    if (cuerpo) p.push('body=' + encodeURIComponent(cuerpo));
    return `mailto:${lista(to).split(',').map(encodeURIComponent).join(',')}${p.length ? '?' + p.join('&') : ''}`;
  }
  const q = new URLSearchParams({ view: 'cm', fs: '1', tf: '1' });
  if (to.length) q.set('to', lista(to));
  if (cc.length) q.set('cc', lista(cc));
  if (bcc.length) q.set('bcc', lista(bcc));
  if (asunto) q.set('su', asunto);
  if (cuerpo) q.set('body', cuerpo);
  return `https://mail.google.com/mail/u/${encodeURIComponent(remitente()).replace('%40', '@')}/?${q.toString().replace(/\+/g, '%20')}`;
}

function abrirCorreo(datos) {
  const url = urlCorreo(datos);
  if (url.startsWith('mailto:')) location.href = url;
  else window.open(url, '_blank', 'noopener');
}

/* Número en formato internacional para WhatsApp. Si no tiene código de país, se asume Argentina (+54 9). */
function numeroWA(tel) {
  let d = soloDigitos(tel);
  if (!d) return '';
  if (String(tel).trim().startsWith('+')) return d;
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('54')) return d;
  if (d.startsWith('0')) d = d.slice(1);
  // Formato local con "15" después del código de área (por ejemplo 011 15 1234 5678): se quita el 15.
  const m = d.match(/^(\d{2,4})15(\d{6,8})$/);
  if (m && (m[1] + m[2]).length === 10) d = m[1] + m[2];
  return d.length === 10 ? '549' + d : d;
}
const urlWhatsApp = (tel, texto) => `https://wa.me/${numeroWA(tel)}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;
function abrirWhatsApp(tel, texto) { window.open(urlWhatsApp(tel, texto), '_blank', 'noopener'); }

const saludo = nombre => (nombre ? `Estimado/a ${nombre.split(' ')[0]}:` : 'Estimados:');
const cuerpoBase = nombre => `${saludo(nombre)}\n\n\n\n${firma()}`;

/* Registra un contacto por correo o WhatsApp como actividad de la cuenta. */
function registrarComunicacion(c, tipo, contactoIds, datos = {}, detalle = '') {
  c.actividades.push({ id: uid(), tipo, fecha: hoy(), contactos: contactoIds, detalle, datos, actualizado: ahora() });
  tocar(c); save();
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
      if (local.modoAcceso === 'redireccion') {
        guardarLocal(); escribir(STORAGE_KEY, db);
        Drive.autorizarRedireccion(clientId(), !local.driveConectado); // la página va a Google y vuelve
        return;
      }
      await Drive.autorizar(clientId(), !local.driveConectado);
    }
    const respaldo = local.ultimoRespaldo !== hoy() ? hoy() : null;
    const datos = await Drive.sincronizar(db, combinar, respaldo);
    db = normalizar(datos);
    escribir(STORAGE_KEY, db);
    Object.assign(local, { driveConectado: true, ultimaSync: ahora(), pendiente: false, ultimoError: '' });
    if (respaldo) local.ultimoRespaldo = respaldo;
    guardarLocal();
    if (interactivo) toast('Datos sincronizados con Google Drive.');
    refrescarVista();
  } catch (e) {
    if (interactivo) {
      local.ultimoError = `${new Date().toLocaleString('es-AR')}: ${e.message || 'No se pudo sincronizar.'}`; guardarLocal();
      toast(e.message || 'No se pudo sincronizar.');
    }
  } finally {
    sincronizando = false; pintarNube();
  }
}

let refrescarVista = () => { if (!$('#btn-back').hidden) return; irInicio(); };

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
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); eventoInstalar = e; if ($('#btn-nueva')) irInicio(); });
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
  if (navigator.onLine) Drive.precargar();
  const cidFijo = !!(window.ALVEON_CONFIG || {}).googleClientId;
  view.innerHTML = `
    <form class="card" id="fcfg">
      <h2>Datos generales</h2>
      <div class="form-row"><label for="c-rep">Nombre del representante (aparece en los PDF)</label>
        <input class="field" id="c-rep" value="${esc(db.config.representante)}"></div>
      <h2 class="mt">Correo</h2>
      <div class="form-row"><label for="c-rem">Cuenta remitente</label>
        <input class="field" id="c-rem" type="email" inputmode="email" autocapitalize="off" value="${esc(remitente())}">
        <p class="hint small">Los correos se abren desde esta cuenta. Debe tener la sesión iniciada en el navegador o en la aplicación Gmail del dispositivo. La aplicación no guarda ni usa contraseñas.</p></div>
      <div class="form-row"><label>Forma de abrir los correos en este dispositivo</label>
        <div class="choice" data-choice="c-modo">
          <button type="button" class="${local.modoCorreo === 'gmail' ? 'on' : ''}" data-val="gmail">Gmail en el navegador</button>
          <button type="button" class="${local.modoCorreo === 'app' ? 'on' : ''}" data-val="app">Aplicación de correo</button>
        </div>
        <input type="hidden" id="c-modo" value="${esc(local.modoCorreo)}">
        <p class="hint small">Recomendado: Gmail en el navegador para Mac y Linux; aplicación de correo en el celular.</p></div>
      <div class="form-row"><label for="c-firma">Firma de los correos</label>
        <textarea class="field" id="c-firma">${esc(firma())}</textarea></div>
      <h2 class="mt">Catálogo de productos y servicios</h2>
      <div class="form-row"><label for="c-prod">Uno por línea</label>
        <textarea class="field tall" id="c-prod">${esc(productos().join('\n'))}</textarea>
        <p class="hint small">Se usan en propuestas, licitaciones, ventas, alquileres y en los productos de interés de cada cuenta.</p></div>
      <button class="btn primary" type="submit">Guardar ajustes</button>
    </form>

    <div class="card">
      <h2>Google Drive</h2>
      <p class="hint">Sincroniza los datos entre el celular, la Mac y la computadora con Linux, y guarda un respaldo diario en la carpeta <b>Alveon B2B</b> de su Drive (separada de la aplicación de visitas médicas).</p>
      ${cidFijo ? '' : `<div class="form-row"><label for="c-cid">ID de cliente de Google</label>
        <input class="field" id="c-cid" value="${esc(local.clientId)}" placeholder="xxxxxxxx.apps.googleusercontent.com" autocomplete="off"></div>`}
      <p class="hint">${local.driveConectado
        ? `Conectado. Última sincronización: ${local.ultimaSync ? new Date(local.ultimaSync).toLocaleString('es-AR') : '—'}.`
        : 'No conectado.'}</p>
      ${local.ultimoError ? `<p class="error-box">Último error: ${esc(local.ultimoError)}</p>` : ''}
      <p class="hint small">Dirección de esta página: ${esc(location.origin)}${clientId() ? ` · ID de cliente terminado en …${esc(clientId().split('.')[0].slice(-6))}` : ''}</p>
      <div class="actions">
        <button class="btn primary" id="c-sync">${local.driveConectado ? 'Sincronizar ahora' : 'Conectar Google Drive'}</button>
        ${local.driveConectado ? '<button class="btn danger" id="c-desc">Desconectar</button>' : '<button class="btn" id="c-redir">Conectar sin ventana emergente</button>'}
      </div>
      <details class="mt"${local.ultimoError && !local.driveConectado ? ' open' : ''}>
        <summary>Conectar sin ventana emergente (recomendado en Safari, iPhone y aplicación instalada)</summary>
        <p class="hint small mt">La página va a Google y vuelve sola. Requiere, una sola vez, agregar esta dirección en Google Cloud →
          Credenciales → su ID de cliente → <b>URI de redireccionamiento autorizados</b>:</p>
        <p class="codigo" id="c-uri">${esc(Drive.urlRetorno())}</p>
        <button class="btn small" id="c-copiar-uri" type="button">Copiar dirección</button>
        <p class="hint small mt">Forma de conexión en este dispositivo: <b>${local.modoAcceso === 'redireccion' ? 'sin ventana emergente' : 'ventana emergente'}</b>.</p>
      </details>
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
    </div>
    <p class="hint small" style="text-align:center">Alveon B2B · versión ${VERSION}</p>`;
  conectarCampos(view);

  $('#fcfg').onsubmit = e => {
    e.preventDefault();
    const rem = $('#c-rem').value.trim();
    if (rem && !emailValido(rem)) { toast('La cuenta remitente no es un correo válido.'); return; }
    const prods = $('#c-prod').value.split('\n').map(s => s.trim()).filter((s, i, a) => s && a.indexOf(s) === i);
    db.config.representante = $('#c-rep').value.trim();
    db.config.remitente = rem || REMITENTE_BASE;
    db.config.firma = $('#c-firma').value.trim();
    db.config.productos = prods.length ? prods : PRODUCTOS_BASE.slice();
    db.config.actualizado = ahora();
    local.modoCorreo = $('#c-modo').value || 'gmail'; guardarLocal();
    save(); toast('Ajustes guardados.'); irInicio();
  };
  $('#c-sync').onclick = async () => {
    if ($('#c-cid')) { local.clientId = $('#c-cid').value.trim(); guardarLocal(); }
    if (!clientId()) { toast('Primero ingrese el ID de cliente de Google.'); return; }
    const prev = refrescarVista;
    refrescarVista = renderAjustes;
    await sincronizar(true);
    refrescarVista = prev;
    renderAjustes();
  };
  if ($('#c-redir')) $('#c-redir').onclick = () => {
    if ($('#c-cid')) { local.clientId = $('#c-cid').value.trim(); }
    if (!clientId()) { toast('Primero ingrese el ID de cliente de Google.'); return; }
    local.modoAcceso = 'redireccion'; guardarLocal();
    sincronizar(true);
  };
  $('#c-copiar-uri').onclick = async () => {
    try { await navigator.clipboard.writeText(Drive.urlRetorno()); toast('Dirección copiada.'); }
    catch (_) { prompt('Copie la dirección:', Drive.urlRetorno()); }
  };
  if ($('#c-desc')) $('#c-desc').onclick = () => {
    if (!confirm('¿Desconectar Google Drive en este dispositivo? Los datos locales y los de Drive se conservan.')) return;
    Drive.desconectar(); Object.assign(local, { driveConectado: false, pendiente: false }); guardarLocal(); pintarNube(); renderAjustes();
  };
  if ($('#c-inst')) $('#c-inst').onclick = async () => { eventoInstalar.prompt(); await eventoInstalar.userChoice; eventoInstalar = null; renderAjustes(); };
  $('#exp').onclick = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    descargar(blob, `alveon-b2b-respaldo-${hoy()}.json`);
  };
  $('#imp').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!d || !Array.isArray(d.cuentas)) throw new Error();
      if (!confirm(`El archivo contiene ${d.cuentas.filter(c => !c.borrado).length} cuenta(s). Se combinará con los datos actuales. ¿Continuar?`)) return;
      db = combinar(db, d);
      save(); toast('Copia importada.'); irInicio();
    } catch (_) { toast('El archivo no es una copia válida de Alveon B2B.'); }
  };
}

function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
