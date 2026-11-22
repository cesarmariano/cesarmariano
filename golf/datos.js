/* Almacenamiento: datos en el dispositivo (localStorage), audios e imágenes en IndexedDB,
   y combinación de copias al sincronizar con Google Drive. */
'use strict';

const CLAVE_DATOS = 'golf-datos-v1';
const CLAVE_LOCAL = 'golf-local-v1'; // ajustes propios de cada dispositivo (no se sincronizan)
const COLECCIONES = ['rondas', 'consejos', 'analisis', 'medios'];

const ahora = () => new Date().toISOString();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const dos = n => String(n).padStart(2, '0');
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`; };

function leer(clave) {
  try { return JSON.parse(localStorage.getItem(clave)); } catch (_) { return null; }
}
function escribir(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch (_) { return false; }
}

/* Agrega los consejos base que falten (si el usuario borró uno, queda la marca de borrado y no vuelve). */
function sembrar(d) {
  CONSEJOS_BASE.forEach(c => { if (!d.consejos.some(x => x.id === c.id)) d.consejos.push(JSON.parse(JSON.stringify(c))); });
}

function normalizar(d) {
  const base = { formato: 1 };
  COLECCIONES.forEach(c => { base[c] = Array.isArray(d && d[c]) ? d[c] : []; });
  base.rondas.forEach(r => {
    r.clima = { tipos: [], temp: '', manual: '', ...(r.clima || {}) };
    r.cancha = { estados: [], manual: '', ...(r.cancha || {}) };
    r.areas = r.areas || {};
    AREAS.forEach(a => { r.areas[a.k] = { nota: null, bien: '', mejorar: '', stats: {}, ...(r.areas[a.k] || {}) }; });
    r.decisiones = r.decisiones || [];
    r.audios = r.audios || [];
  });
  sembrar(base);
  return base;
}

let db = { formato: 1, rondas: [], consejos: [], analisis: [], medios: [] };
let local = {
  clientId: '', driveConectado: false, cuenta: '', ultimaSync: '', ultimoRespaldo: '', pendiente: false,
  claveIA: '', modeloIA: 'claude-opus-5-5', seccion: 'rondas'
};
function cargarDatos() {
  db = normalizar(leer(CLAVE_DATOS));
  local = { ...local, ...(leer(CLAVE_LOCAL) || {}) };
}
const guardarLocal = () => escribir(CLAVE_LOCAL, local);

function guardarDatos() {
  if (!escribir(CLAVE_DATOS, db)) toast('No se pudo guardar en este dispositivo (almacenamiento lleno).', 6000);
  local.pendiente = true; guardarLocal();
  if (typeof programarSync === 'function') programarSync();
  if (typeof pintarNube === 'function') pintarNube();
}

const vivos = c => db[c].filter(x => !x.borrado);
const buscarId = (c, id) => db[c].find(x => x.id === id && !x.borrado);

function guardarRegistro(c, obj) {
  obj.actualizado = ahora();
  if (!obj.creado) obj.creado = obj.actualizado;
  const i = db[c].findIndex(x => x.id === obj.id);
  if (i >= 0) db[c][i] = obj; else db[c].push(obj);
  guardarDatos();
  return obj;
}

// El registro borrado queda como marca para que el borrado llegue a los otros dispositivos.
function borrarRegistro(c, id) {
  const i = db[c].findIndex(x => x.id === id);
  if (i < 0) return;
  db[c][i] = { id, borrado: true, actualizado: ahora() };
  guardarDatos();
}

/* Combina dos copias: por cada registro prevalece la modificación más reciente. */
function combinar(a, b) {
  const r = { formato: 1 };
  COLECCIONES.forEach(c => {
    const m = new Map();
    [...((a && a[c]) || []), ...((b && b[c]) || [])].forEach(x => {
      if (!x || !x.id) return;
      const y = m.get(x.id);
      if (!y || (x.actualizado || '') > (y.actualizado || '')) m.set(x.id, x);
    });
    r[c] = [...m.values()];
  });
  return r;
}

/* ---------- Audios e imágenes (IndexedDB) ---------- */
const Medios = (() => {
  let abierta = null;
  function abrir() {
    if (!abierta) {
      abierta = new Promise((ok, mal) => {
        const r = indexedDB.open('golf-medios', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('blobs');
        r.onsuccess = () => ok(r.result);
        r.onerror = () => { abierta = null; mal(r.error); };
      });
    }
    return abierta;
  }
  async function op(modo, fn) {
    const d = await abrir();
    return new Promise((ok, mal) => {
      const t = d.transaction('blobs', modo);
      const req = fn(t.objectStore('blobs'));
      t.oncomplete = () => ok(req ? req.result : undefined);
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error || new Error('Operación cancelada.'));
    });
  }
  return {
    poner: (id, blob) => op('readwrite', s => s.put(blob, id)),
    tomar: id => op('readonly', s => s.get(id)),
    quitar: id => op('readwrite', s => s.delete(id))
  };
})();

/* Guarda un archivo nuevo (audio o imagen) y registra sus datos para sincronizarlo. */
async function nuevoMedio(blob, tipo) {
  const id = 'm' + uid();
  await Medios.poner(id, blob);
  guardarRegistro('medios', { id, tipo, mime: blob.type || '', tam: blob.size, driveId: '' });
  return id;
}

/* Devuelve el archivo: del dispositivo o, si no está, lo descarga de Drive. */
async function obtenerMedio(id) {
  const b = await Medios.tomar(id).catch(() => null);
  if (b) return b;
  const m = buscarId('medios', id);
  if (!m || !m.driveId) return null;
  if (!Drive.tieneToken()) throw new Error('El archivo está en Google Drive. Sincronice para descargarlo.');
  const blob = await Drive.bajarMedio(m.driveId);
  await Medios.poner(id, blob).catch(() => {});
  return blob;
}

async function borrarMedio(id) {
  await Medios.quitar(id).catch(() => {});
  borrarRegistro('medios', id);
}

/* Sube a Drive los archivos de este dispositivo que todavía no están en la nube. */
async function subirMediosPendientes(paso) {
  const pendientes = vivos('medios').filter(m => !m.driveId);
  let n = 0;
  for (const m of pendientes) {
    const blob = await Medios.tomar(m.id).catch(() => null);
    if (!blob) continue; // el archivo está en otro dispositivo
    n++; paso(`Subiendo audios e imágenes a Drive (${n})…`);
    const ext = (m.mime.split('/')[1] || 'bin').split(';')[0];
    m.driveId = await Drive.subirMedio(`${m.tipo}-${m.id}.${ext}`, blob);
    m.actualizado = ahora();
  }
  if (n) escribir(CLAVE_DATOS, db);
}
