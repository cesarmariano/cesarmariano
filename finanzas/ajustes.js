/* Finanzas familiares – ajustes, conceptos, sincronización con Google Drive e instalación. */
'use strict';

/* ---------- Ajustes ---------- */
function renderAjustes() {
  setHeader('Ajustes', () => irInicio());
  const c = db.config;
  const cidFijo = !!(window.FIN_CONFIG || {}).googleClientId;
  const filaConcepto = x => `<button class="fila-simple" data-con="${esc(x.id)}">
    <span>${esc(x.nombre)}${x.activo ? '' : ' <span class="hint">(inactivo)</span>'}</span>
    <small>${x.montoHabitual !== '' && x.montoHabitual != null ? esc(monto(x.montoHabitual, x.moneda, false)) + ' · ' : ''}${x.eventual ? 'eventual' : 'día ' + esc(x.dia)}${x.tipo === 'egreso' ? ' · ' + esc(x.categoria) : ''}</small></button>`;
  view.innerHTML = `
    <div class="card">
      <div class="row-between"><h2 style="margin:0">Ingresos habituales</h2><button class="btn chico" id="c-ing">+ Agregar</button></div>
      <p class="hint" style="margin:6px 0 4px">Fuentes de ingreso. "Preparar el mes" las agrega como previstas con el monto y el día indicados.</p>
      ${conceptosDe('ingreso').map(filaConcepto).join('')}
    </div>
    <div class="card">
      <div class="row-between"><h2 style="margin:0">Gastos habituales</h2><button class="btn chico" id="c-egr">+ Agregar</button></div>
      <p class="hint" style="margin:6px 0 4px">Gastos fijos que se pagan desde el banco. Las tarjetas se cargan aparte, con su resumen.</p>
      ${conceptosDe('egreso').map(filaConcepto).join('')}
    </div>
    <div class="card">
      <h2>Cuentas de gasto</h2>
      <p class="hint">Cada gasto y cada consumo de tarjeta se asigna a una de estas cuentas.</p>
      <div class="chips">${c.categorias.map(x => `<button type="button" class="chip" data-quitar="${esc(x)}" title="Quitar">${esc(x)} ✕</button>`).join('')}</div>
      <div class="agregar-linea"><input class="field" id="c-nueva-cat" placeholder="Nueva cuenta" autocomplete="off"><button class="btn" id="c-add-cat" type="button">Agregar</button></div>
    </div>

    <form class="card" id="fcfg" novalidate>
      <h2>Ahorro e inversiones</h2>
      <div class="form-row"><label for="c-res">Reserva mínima en el banco</label>${campoMonto('c-res', c.reserva)}
        <p class="hint" style="margin:6px 0 0">Dinero que siempre debe quedar en la cuenta. El remanente para ahorrar se calcula por encima de este monto.</p></div>
      <div class="grid2">
        <div class="form-row"><label for="c-meses">Fondo de emergencia (meses de gastos)</label>
          <input class="field" id="c-meses" type="number" inputmode="numeric" min="0" max="24" value="${esc(c.mesesEmergencia)}"></div>
        <div class="form-row"><label for="c-perfil">Perfil de inversión</label>
          <select class="field" id="c-perfil">${opciones(Object.entries(PERFILES).map(([k, p]) => [k, p.nombre]), c.perfil)}</select></div>
        <div class="form-row"><label for="c-min">Monto mínimo para invertir</label>${campoMonto('c-min', c.montoMinimo)}</div>
        <div class="form-row"><label for="c-minb">Mínimo para acciones o CEDEARs</label>${campoMonto('c-minb', c.montoMinimoBolsa)}</div>
      </div>
      <h2 style="margin-top:8px">Tasas vigentes</h2>
      <p class="hint">Cárguelas cada tanto: se usan para comparar el plazo fijo con la inflación y estimar intereses.</p>
      <div class="grid2">
        <div class="form-row"><label for="c-tpf">Plazo fijo: TNA (%)</label>${campoMonto('c-tpf', c.tnaPlazoFijo)}</div>
        <div class="form-row"><label for="c-tmm">Cuenta remunerada: TNA (%)</label>${campoMonto('c-tmm', c.tnaMoneyMarket)}</div>
        <div class="form-row"><label for="c-inf">Inflación mensual esperada (%)</label>${campoMonto('c-inf', c.inflacionMensual)}</div>
      </div>
      <div class="error" id="c-err"></div>
      <button class="btn primary" type="submit">Guardar</button>
    </form>

    <div class="card">
      <h2>Google Drive</h2>
      <p class="hint">Sincroniza los datos entre el iPhone, la Mac y la computadora con Linux, y guarda un respaldo diario en la carpeta <b>Finanzas familiares</b> de su Drive. La aplicación sólo puede ver los archivos que ella misma crea.</p>
      ${cidFijo ? '' : `<div class="form-row"><label for="c-cid">ID de cliente de Google</label>
        <input class="field" id="c-cid" value="${esc(local.clientId)}" placeholder="xxxxxxxx.apps.googleusercontent.com" autocomplete="off"></div>`}
      <p class="hint">${local.driveConectado
        ? `Conectado${local.cuenta ? ` como <b>${esc(local.cuenta)}</b>` : ''}. Última sincronización: ${local.ultimaSync ? new Date(local.ultimaSync).toLocaleString('es-AR') : '—'}.`
        : 'No conectado.'}</p>
      <p id="sync-estado" class="sync-estado${ultimoEstadoSync.error ? ' error' : ''}${ultimoEstadoSync.texto ? '' : ' vacio'}" role="status">${esc(ultimoEstadoSync.texto)}</p>
      <div class="actions">
        <button class="btn primary" id="c-sync">${local.driveConectado ? 'Sincronizar ahora' : 'Conectar Google Drive'}</button>
        ${local.driveConectado ? '<button class="btn danger" id="c-desc">Desconectar</button>' : '<button class="btn" id="c-redir">Conectar con otro método</button>'}
      </div>
      ${local.driveConectado ? '<button class="btn" id="c-cuenta">Cambiar de cuenta de Google</button>' : `<p class="hint">"Conectar con otro método" no usa ventana emergente. Requiere agregar
        <b>${esc(direccionRetorno())}</b> en "URI de redireccionamiento autorizados" del ID de cliente en Google Cloud.</p>`}
    </div>

    <div class="card">
      <h2>Instalar en otros dispositivos</h2>
      <p class="hint">La página de instalación muestra el enlace, un código QR para el iPhone y las instrucciones para Mac y Linux.</p>
      ${eventoInstalar && !instalada() ? '<button class="btn primary" id="c-inst" style="margin-bottom:10px">Instalar en este dispositivo</button>' : ''}
      <a class="btn" href="instalar.html">Página de instalación</a>
    </div>

    <div class="card">
      <h2>Acerca de</h2>
      <p class="value" style="margin-top:0">Finanzas familiares · <b>versión ${esc(self.FIN_VERSION)}</b>
        <span class="hint">(${fmtFecha((self.FIN_NOVEDADES[0] || {}).fecha)})</span></p>
      <details class="novedades"><summary>Historial de versiones</summary>
        ${self.FIN_NOVEDADES.map(n => `<div class="visit"><div class="meta"><span>Versión ${esc(n.v)}</span><span class="hint">${fmtFecha(n.fecha)}</span></div>
          <ul>${n.cambios.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}
      </details>
    </div>

    <div class="card">
      <h2>Copia de seguridad manual</h2>
      <p class="hint">Archivo con todos los datos, para guardar o pasar a otro equipo.</p>
      <div class="actions">
        <button class="btn" id="exp">Exportar copia</button>
        <label class="btn" for="imp">Importar copia</label>
      </div>
      <input type="file" id="imp" accept="application/json,.json" hidden>
    </div>`;

  $('#c-ing').onclick = () => renderConcepto(null, 'ingreso');
  $('#c-egr').onclick = () => renderConcepto(null, 'egreso');
  view.querySelectorAll('[data-con]').forEach(b => (b.onclick = () => renderConcepto(b.dataset.con)));
  view.querySelectorAll('[data-quitar]').forEach(b => (b.onclick = () => {
    const cat = b.dataset.quitar;
    if (c.categorias.length <= 1) return;
    if (!confirm(`¿Quitar la cuenta "${cat}"? Los gastos ya asignados conservan el nombre.`)) return;
    c.categorias = c.categorias.filter(x => x !== cat); c.actualizado = ahora(); save(); renderAjustes();
  }));
  $('#c-add-cat').onclick = () => {
    const n = $('#c-nueva-cat').value.trim();
    if (!n || c.categorias.includes(n)) return;
    c.categorias = [...c.categorias, n]; c.actualizado = ahora(); save(); renderAjustes();
  };
  $('#fcfg').onsubmit = e => {
    e.preventDefault();
    const v = { reserva: leerMonto('c-res'), montoMinimo: leerMonto('c-min'), montoMinimoBolsa: leerMonto('c-minb'),
      tnaPlazoFijo: leerMonto('c-tpf'), tnaMoneyMarket: leerMonto('c-tmm'), inflacionMensual: leerMonto('c-inf') };
    if (Object.values(v).some(x => Number.isNaN(x))) { $('#c-err').textContent = 'Revise los valores numéricos.'; return; }
    const tasasCambiaron = ['tnaPlazoFijo', 'tnaMoneyMarket', 'inflacionMensual'].some(k => num(v[k]) !== num(c[k]));
    Object.keys(v).forEach(k => (c[k] = num(v[k])));
    c.mesesEmergencia = Math.max(0, parseInt($('#c-meses').value, 10) || 0);
    c.perfil = $('#c-perfil').value;
    if (tasasCambiaron) c.fechaTasas = hoy();
    c.actualizado = ahora();
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
  if ($('#c-cuenta')) $('#c-cuenta').onclick = async () => {
    Drive.olvidarToken();
    refrescarVista = renderAjustes;
    await sincronizar(true, { elegirCuenta: true });
    refrescarVista = irInicio;
    renderAjustes();
  };
  if ($('#c-desc')) $('#c-desc').onclick = () => {
    if (!confirm('¿Desconectar Google Drive en este dispositivo? Los datos locales y los de Drive se conservan.')) return;
    Drive.desconectar(); Object.assign(local, { driveConectado: false, pendiente: false, cuenta: '' }); guardarLocal(); pintarNube(); renderAjustes();
  };
  if ($('#c-inst')) $('#c-inst').onclick = async () => { eventoInstalar.prompt(); await eventoInstalar.userChoice; eventoInstalar = null; renderAjustes(); };
  $('#exp').onclick = () => descargar(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }), `finanzas-respaldo-${hoy()}.json`);
  $('#imp').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!d || !Array.isArray(d.movimientos)) throw new Error();
      if (!confirm(`El archivo contiene ${d.movimientos.filter(m => !m.borrado).length} movimiento(s) y ${(d.resumenes || []).filter(r => !r.borrado).length} resumen(es) de tarjeta. Se combinará con los datos actuales. ¿Continuar?`)) return;
      db = combinar(db, d);
      save(); toast('Copia importada.'); irInicio();
    } catch (_) { toast('El archivo no es una copia válida.'); }
  };
}

function renderConcepto(id, tipoNuevo) {
  const c0 = id ? buscar('conceptos', id) : null;
  const tipo = c0 ? c0.tipo : tipoNuevo;
  const x = c0 ? { ...c0 } : { id: uid(), tipo, nombre: '', grupo: '', categoria: tipo === 'egreso' ? 'Consumo' : '', montoHabitual: '', moneda: 'ARS', dia: 1, activo: true, eventual: false, orden: 50 };
  const grupos = [...new Set(conceptosDe('ingreso').map(c => c.grupo).filter(Boolean))];
  setHeader(c0 ? x.nombre : tipo === 'ingreso' ? 'Nuevo ingreso habitual' : 'Nuevo gasto habitual', renderAjustes);
  view.innerHTML = `
    <form class="card" id="fedit" novalidate>
      <div class="form-row"><label for="k-nombre">Nombre</label><input class="field" id="k-nombre" value="${esc(x.nombre)}" autocomplete="off"><div class="error" id="err-nombre"></div></div>
      ${tipo === 'ingreso'
        ? `<div class="form-row"><label for="k-grupo">Grupo</label><input class="field" id="k-grupo" value="${esc(x.grupo)}" list="k-grupos" autocomplete="off">
            <datalist id="k-grupos">${grupos.map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>`
        : `<div class="form-row"><label for="k-cat">Cuenta</label><select class="field" id="k-cat">${opciones(db.config.categorias, x.categoria)}</select></div>`}
      <div class="grid2">
        <div class="form-row"><label for="k-monto">Monto habitual</label>${campoMonto('k-monto', x.montoHabitual)}</div>
        <div class="form-row"><label for="k-mon">Moneda</label><select class="field" id="k-mon">${opciones([['ARS', 'Pesos'], ['USD', 'Dólares']], x.moneda)}</select></div>
        <div class="form-row"><label for="k-dia">Día del mes</label><input class="field" id="k-dia" type="number" inputmode="numeric" min="1" max="31" value="${esc(x.dia)}"></div>
      </div>
      <p class="hint">Si el monto habitual queda vacío, al preparar el mes se usa el monto del mes anterior.</p>
      <label class="check"><input type="checkbox" id="k-activo" ${x.activo ? 'checked' : ''}> Activo</label>
      <label class="check"><input type="checkbox" id="k-event" ${x.eventual ? 'checked' : ''}> Eventual (no se agrega solo al preparar el mes)</label>
      <button class="btn primary" type="submit" style="margin-top:8px">Guardar</button>
      ${c0 ? '<button class="btn danger" type="button" id="k-borrar" style="margin-top:10px">Eliminar</button>' : ''}
    </form>`;
  $('#fedit').onsubmit = e => {
    e.preventDefault();
    const nombre = $('#k-nombre').value.trim();
    if (!nombre) { $('#err-nombre').textContent = 'Ingrese el nombre.'; return; }
    const m = leerMonto('k-monto');
    guardarRegistro('conceptos', { ...x, nombre, grupo: $('#k-grupo') ? $('#k-grupo').value.trim() : '', categoria: $('#k-cat') ? $('#k-cat').value : '',
      montoHabitual: Number.isNaN(m) ? '' : m, moneda: $('#k-mon').value, dia: Math.min(31, Math.max(1, parseInt($('#k-dia').value, 10) || 1)),
      activo: $('#k-activo').checked, eventual: $('#k-event').checked });
    save(); toast('Guardado.'); renderAjustes();
  };
  if ($('#k-borrar')) $('#k-borrar').onclick = () => {
    if (!confirm('¿Eliminar este concepto? Los movimientos ya cargados se conservan. Para dejar de usarlo sin perder el nombre, conviene desmarcar "Activo".')) return;
    borrarRegistro('conceptos', x.id); save(); renderAjustes();
  };
}

/* ---------- Sincronización con Google Drive ---------- */
const clientId = () => (window.FIN_CONFIG || {}).googleClientId || local.clientId;
let syncTimer = null, sincronizando = false;
function programarSync() {
  clearTimeout(syncTimer);
  if (Drive.tieneToken()) syncTimer = setTimeout(() => sincronizar(false), 2000);
}
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
    const datos = await Drive.sincronizar(db, async (loc, remoto) => combinar(loc, remoto), respaldo, estadoSync);
    db = normalizar(datos);
    escribir(STORAGE_KEY, db);
    Object.assign(local, { driveConectado: true, ultimaSync: inicio, pendiente: false });
    if (!local.cuenta || opciones.elegirCuenta) { try { local.cuenta = await Drive.cuenta(); } catch (_) { /* se intentará la próxima vez */ } }
    if (respaldo) local.ultimoRespaldo = respaldo;
    guardarLocal();
    estadoSync('');
    if (interactivo) toast('Datos sincronizados con Google Drive.');
    // No se redibuja la pantalla si el usuario está completando un formulario.
    if (!$('#fedit') && !$('#fres') && !document.querySelector('.modal-capa')) refrescarVista();
  } catch (e) {
    const msg = e.message || 'No se pudo sincronizar.';
    estadoSync(msg, true);
    if (interactivo) toast(msg, 8000);
  } finally {
    sincronizando = false; pintarNube();
  }
}
let refrescarVista = () => irInicio();

const direccionRetorno = () => new URL('index.html', location.href.split('#')[0].split('?')[0]).href;
function conectarPorRedireccion() {
  if (!clientId()) { toast('Primero ingrese el ID de cliente de Google.'); return; }
  const estado = uid();
  try { sessionStorage.setItem('finanzas-oauth-estado', estado); } catch (_) { /* sin almacenamiento */ }
  location.href = Drive.urlRedireccion(clientId(), direccionRetorno(), estado, local.cuenta);
}
function procesarRetornoGoogle() {
  let estado = '';
  try { estado = sessionStorage.getItem('finanzas-oauth-estado') || ''; } catch (_) { /* sin almacenamiento */ }
  const r = Drive.leerRedireccion(location.hash, estado);
  if (!r) return false;
  try { sessionStorage.removeItem('finanzas-oauth-estado'); } catch (_) { /* sin almacenamiento */ }
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
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); eventoInstalar = e; if (!$('#fedit') && !$('#fres')) irInicio(); });
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
