/* Ajustes, sincronización con Google Drive, instalación y copia de seguridad. */
'use strict';

/* ---------- Sincronización con Google Drive ---------- */
const clientId = () => local.clientId || (window.GOLF_CONFIG || {}).googleClientId || '';
let syncTimer = null, sincronizando = false;

function programarSync() {
  clearTimeout(syncTimer);
  if (Drive.tieneToken()) syncTimer = setTimeout(() => sincronizar(false), 2000);
}

const editando = () => !!($('#fronda') || $('#fcons') || document.querySelector('.capa'));
let refrescarVista = () => irInicio();

async function sincronizar(interactivo, opciones = {}) {
  if (sincronizando) return;
  if (!navigator.onLine) { if (interactivo) toast('Sin conexión. Se sincronizará más tarde.'); return; }
  sincronizando = true; pintarNube();
  try {
    if (!Drive.tieneToken()) {
      if (!interactivo) return;
      estadoSync('Esperando la autorización en la ventana de Google…');
      await Drive.autorizar(clientId(), { consentimiento: !local.driveConectado && !local.cuenta, cuenta: local.cuenta, elegirCuenta: !!opciones.elegirCuenta });
      estadoSync('Autorización recibida.');
    }
    const respaldo = local.ultimoRespaldo !== hoy() ? hoy() : null;
    const inicio = ahora();
    await subirMediosPendientes(estadoSync);
    const datos = await Drive.sincronizar(db, async (a, b) => combinar(a, b), respaldo, estadoSync);
    db = normalizar(datos);
    escribir(CLAVE_DATOS, db);
    Object.assign(local, { driveConectado: true, ultimaSync: inicio, pendiente: false });
    if (!local.cuenta || opciones.elegirCuenta) { try { local.cuenta = await Drive.cuenta(); } catch (_) { /* se intentará la próxima vez */ } }
    if (respaldo) local.ultimoRespaldo = respaldo;
    guardarLocal();
    estadoSync('');
    if (interactivo) toast('Datos sincronizados con Google Drive.');
    if (!editando()) refrescarVista();
  } catch (e) {
    const msg = e.message || 'No se pudo sincronizar.';
    estadoSync(msg, true);
    if (interactivo) toast(msg, 8000);
  } finally {
    sincronizando = false; pintarNube();
  }
}

/* Conexión alternativa (sin ventana emergente): la página va a Google y vuelve con el permiso. */
const direccionRetorno = () => new URL('index.html', location.href.split('#')[0].split('?')[0]).href;
function conectarPorRedireccion() {
  if (!clientId()) { toast('Primero ingrese el ID de cliente de Google.'); return; }
  const estado = uid();
  try { sessionStorage.setItem('golf-oauth-estado', estado); } catch (_) { /* sin almacenamiento */ }
  location.href = Drive.urlRedireccion(clientId(), direccionRetorno(), estado, local.cuenta);
}
function procesarRetornoGoogle() {
  let estado = '';
  try { estado = sessionStorage.getItem('golf-oauth-estado') || ''; } catch (_) { /* sin almacenamiento */ }
  const r = Drive.leerRedireccion(location.hash, estado);
  if (!r) return false;
  try { sessionStorage.removeItem('golf-oauth-estado'); } catch (_) { /* sin almacenamiento */ }
  history.replaceState(null, '', location.pathname + location.search);
  renderAjustes();
  if (r.error) { estadoSync(r.error, true); toast(r.error, 8000); return true; }
  refrescarVista = renderAjustes;
  sincronizar(true).then(() => { refrescarVista = irInicio; renderAjustes(); });
  return true;
}
window.addEventListener('drive-token', () => {
  refrescarVista = $('#sync-estado') ? renderAjustes : irInicio;
  sincronizar(true).then(() => { refrescarVista = irInicio; });
});
window.addEventListener('drive-error', e => { estadoSync(e.detail, true); toast(e.detail, 8000); });

let ultimoEstadoSync = { texto: '', error: false };
function estadoSync(texto, error = false) {
  ultimoEstadoSync = { texto, error };
  const el = $('#sync-estado');
  if (el) { el.textContent = texto; el.className = 'sync-estado' + (error ? ' error' : '') + (texto ? '' : ' vacio'); }
}

function pintarNube() {
  const b = $('#btn-sync');
  if (!b) return;
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
  const fijo = (window.GOLF_CONFIG || {}).googleClientId || '';
  view.innerHTML = `
    <section class="card">
      <h2>Google Drive</h2>
      <p class="hint">Sincroniza las rondas, los consejos, los audios y las imágenes entre el celular, la Mac y la computadora con Linux,
        y guarda un respaldo diario en la carpeta <b>Mi Golf</b> de su Drive. La aplicación sólo puede ver los archivos que ella misma crea.</p>
      <p>${local.driveConectado ? `Conectado${local.cuenta ? ' con <b>' + esc(local.cuenta) + '</b>' : ''}. Última sincronización: ${local.ultimaSync ? esc(new Date(local.ultimaSync).toLocaleString('es-AR')) : '—'}.` : 'No conectado en este dispositivo.'}</p>
      <p id="sync-estado" class="sync-estado${ultimoEstadoSync.error ? ' error' : ''}${ultimoEstadoSync.texto ? '' : ' vacio'}" role="status">${esc(ultimoEstadoSync.texto)}</p>
      <div class="pila">
        <button class="btn primary" id="c-sync">${local.driveConectado ? 'Sincronizar ahora' : 'Conectar Google Drive'}</button>
        ${local.driveConectado ? '<button class="btn" id="c-cuenta">Cambiar de cuenta de Google</button>' : ''}
        <button class="btn" id="c-redir">Conectar con otro método</button>
        ${local.driveConectado ? '<button class="btn danger" id="c-desc">Desconectar en este dispositivo</button>' : ''}
      </div>
      <details class="mas"><summary>ID de cliente de Google</summary>
        <p class="hint">${fijo ? 'La aplicación ya trae un ID de cliente. Sólo complete este campo para usar uno propio.' : 'Ingrese el ID de cliente de OAuth (termina en .apps.googleusercontent.com).'}</p>
        <input class="field" id="c-cid" value="${esc(local.clientId)}" placeholder="${esc(fijo || '….apps.googleusercontent.com')}">
        <button class="btn" id="c-cid-g">Guardar ID de cliente</button>
      </details>
    </section>

    <section class="card">
      <h2>Claude (análisis con IA)</h2>
      <p class="hint">Se usa para analizar el historial, ordenar las notas de voz en cada área y resumir publicaciones.
        Necesita una clave de API de Anthropic (console.anthropic.com → API Keys). El uso se cobra en esa cuenta según los textos enviados.
        La clave se guarda sólo en este dispositivo y no se sincroniza.</p>
      <div class="form-row"><label for="c-clave">Clave de API</label>
        <input class="field" id="c-clave" type="password" autocomplete="off" placeholder="sk-ant-…" value="${esc(local.claveIA)}"></div>
      <div class="form-row"><label for="c-modelo">Modelo</label><select class="field" id="c-modelo">
        ${IA.MODELOS.map(m => `<option value="${m.id}"${local.modeloIA === m.id ? ' selected' : ''}>${esc(m.nombre)}</option>`).join('')}</select></div>
      <div class="actions"><button class="btn primary" id="c-ia-g">Guardar</button><button class="btn" id="c-ia-p">Probar conexión</button></div>
      <p class="hint" id="c-ia-estado"></p>
    </section>

    <section class="card">
      <h2>Puntaje de las rondas</h2>
      <p class="hint">Campo 3 puntos, clima 3 puntos y juego 4 puntos (suma o resta).</p>
      <button class="btn" id="c-formula">Ver cómo se calcula</button>
    </section>

    <section class="card">
      <h2>Copia de seguridad</h2>
      <p class="hint">Archivo con todas las rondas, consejos y análisis (los audios y las imágenes quedan en Google Drive).</p>
      <div class="actions"><button class="btn" id="c-exp">Exportar</button><label class="btn" for="c-imp">Importar</label></div>
      <input type="file" id="c-imp" accept="application/json,.json" hidden>
    </section>

    ${!instalada() ? `<section class="card"><h2>Instalar en este dispositivo</h2>
      ${eventoInstalar ? '<button class="btn primary" id="c-inst">Instalar la aplicación</button>' : `<p class="hint">
        iPhone: Safari → botón Compartir → "Agregar a la pantalla de inicio".<br>
        Mac y Linux: Chrome o Edge → ícono de instalación en la barra de direcciones.<br>
        Android: Chrome → menú ⋮ → "Instalar aplicación".</p>`}</section>` : ''}

    <section class="card">
      <h2>Acerca de</h2>
      <p>Mi Golf, versión ${esc(self.GOLF_VERSION)}</p>
      <details class="mas"><summary>Historial de versiones</summary>
        ${self.GOLF_NOVEDADES.map(n => `<p><b>${n.v}</b> · ${esc(fmtFecha(n.fecha))}</p><ul class="lista">${n.cambios.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}
      </details>
    </section>`;

  $('#c-sync').onclick = () => {
    if (!clientId()) { toast('Primero ingrese el ID de cliente de Google.'); return; }
    refrescarVista = renderAjustes;
    sincronizar(true).then(() => { refrescarVista = irInicio; });
  };
  if ($('#c-cuenta')) $('#c-cuenta').onclick = () => {
    Drive.olvidarToken(); local.cuenta = ''; guardarLocal();
    refrescarVista = renderAjustes;
    sincronizar(true, { elegirCuenta: true }).then(() => { refrescarVista = irInicio; });
  };
  $('#c-redir').onclick = conectarPorRedireccion;
  if ($('#c-desc')) $('#c-desc').onclick = () => {
    if (!confirm('¿Desconectar Google Drive en este dispositivo? Los datos locales y los de Drive se conservan.')) return;
    Drive.desconectar(); Object.assign(local, { driveConectado: false, pendiente: false, cuenta: '' }); guardarLocal(); pintarNube(); renderAjustes();
  };
  $('#c-cid-g').onclick = () => {
    local.clientId = $('#c-cid').value.trim(); guardarLocal();
    Drive.precargar(clientId()).catch(() => {});
    toast('ID de cliente guardado.');
  };
  const guardarIA = () => { local.claveIA = $('#c-clave').value.trim(); local.modeloIA = $('#c-modelo').value; guardarLocal(); };
  $('#c-ia-g').onclick = () => { guardarIA(); toast('Configuración de Claude guardada.'); };
  $('#c-ia-p').onclick = async () => {
    guardarIA();
    const est = $('#c-ia-estado'); est.textContent = 'Probando…';
    try { await IA.probar(); est.textContent = 'Conexión correcta con ' + local.modeloIA + '.'; }
    catch (e) { est.textContent = e.message; }
  };
  $('#c-formula').onclick = mostrarFormula;
  $('#c-exp').onclick = () => {
    const blob = new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `mi-golf-${hoy()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  $('#c-imp').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!Array.isArray(d.rondas)) throw new Error('El archivo no corresponde a esta aplicación.');
      if (!confirm('Los datos del archivo se combinarán con los de este dispositivo. ¿Continuar?')) return;
      db = normalizar(combinar(db, d)); guardarDatos();
      toast('Datos importados.');
    } catch (err) { toast(err.message || 'No se pudo leer el archivo.', 6000); }
    e.target.value = '';
  };
  if ($('#c-inst')) $('#c-inst').onclick = async () => { eventoInstalar.prompt(); await eventoInstalar.userChoice; eventoInstalar = null; renderAjustes(); };
}
