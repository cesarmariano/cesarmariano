/* Sincronización y respaldos en Google Drive del usuario.
   Usa el permiso "drive.file": la aplicación sólo ve los archivos que ella misma crea.
   Estructura en Drive:  Alveon B2B/alveon-b2b.json  (+ respaldos diarios con fecha).
   Es una carpeta distinta de la aplicación de visitas médicas (Alveon Visitas): los datos no se mezclan. */
'use strict';

const Drive = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const CARPETA = 'Alveon B2B';
  const ARCHIVO = 'alveon-b2b.json';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  let token = null, vence = 0, tokenClient = null, gisPromise = null;

  const TOKEN_KEY = 'alveon-b2b-token', ESTADO_KEY = 'alveon-b2b-oauth-estado';
  // El permiso de Google dura una hora; se conserva en la pestaña para no pedirlo en cada recarga.
  try { const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY)); if (t) { token = t.token; vence = t.vence; } } catch (_) { /* sin almacenamiento */ }
  function guardarToken(t, segundos) {
    token = t; vence = Date.now() + (Number(segundos) || 3600) * 1000;
    try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, vence })); } catch (_) { /* sin almacenamiento */ }
  }

  const tieneToken = () => token && Date.now() < vence - 60000;

  /* ---- Acceso por redirección (sin ventana emergente) ----
     La página completa va a Google y vuelve a esta misma dirección con el permiso.
     Requiere que la dirección de retorno figure en "URI de redireccionamiento autorizados" del ID de cliente. */
  const urlRetorno = () => new URL('./', location.href).href;

  function autorizarRedireccion(clientId, forzarConsentimiento) {
    if (!clientId) throw new Error('Falta configurar el ID de cliente de Google en Ajustes.');
    const estado = Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { localStorage.setItem(ESTADO_KEY, estado); } catch (_) { /* sin almacenamiento */ }
    const q = new URLSearchParams({
      client_id: clientId, redirect_uri: urlRetorno(), response_type: 'token', scope: SCOPE,
      include_granted_scopes: 'true', state: estado
    });
    if (forzarConsentimiento) q.set('prompt', 'consent');
    location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + q.toString());
  }

  /* Al volver de Google: toma el permiso de la dirección y la limpia.
     Devuelve null si no se vuelve de Google, { ok: true } o { error: 'mensaje' }. */
  function recibirRedireccion() {
    const h = location.hash.startsWith('#') ? new URLSearchParams(location.hash.slice(1)) : null;
    if (!h || !(h.has('access_token') || h.has('error'))) return null;
    history.replaceState(null, '', location.pathname + location.search);
    let esperado = null;
    try { esperado = localStorage.getItem(ESTADO_KEY); localStorage.removeItem(ESTADO_KEY); } catch (_) { /* sin almacenamiento */ }
    if (!esperado || h.get('state') !== esperado) return { error: 'La respuesta de Google no corresponde a esta solicitud. Vuelva a intentar.' };
    if (h.has('error')) return { error: mensajeError(h.get('error'), h.get('error_description')) };
    if (!String(h.get('scope') || '').includes(SCOPE)) return { error: 'No se otorgó el permiso para Google Drive. Vuelva a conectar y tilde la casilla de acceso a Drive.' };
    guardarToken(h.get('access_token'), h.get('expires_in'));
    return { ok: true };
  }

  function cargarGIS() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (!gisPromise) {
      gisPromise = new Promise((ok, mal) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true; s.onload = ok;
        s.onerror = () => { gisPromise = null; mal(new Error('No se pudo cargar el acceso de Google. Verifique la conexión.')); };
        document.head.appendChild(s);
      });
    }
    return gisPromise;
  }

  /* Debe llamarse a partir de un toque del usuario (Google abre una ventana emergente).
     Si la biblioteca de Google ya está cargada, la ventana se abre sin demoras: así el navegador
     no la bloquea. Por eso se precarga al entrar en Ajustes (precargar), nunca en la pantalla principal. */
  function autorizar(clientId, forzarConsentimiento) {
    if (!clientId) return Promise.reject(new Error('Falta configurar el ID de cliente de Google en Ajustes.'));
    const pedir = () => new Promise((ok, mal) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: r => {
          if (r.error) return mal(new Error(mensajeError(r.error, r.error_description)));
          if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) {
            return mal(new Error('No se otorgó el permiso para Google Drive. Vuelva a conectar y tilde la casilla de acceso a Drive.'));
          }
          guardarToken(r.access_token, r.expires_in);
          ok();
        },
        error_callback: e => mal(new Error(
          e?.type === 'popup_closed' ? 'Se cerró la ventana de Google antes de terminar. Use "Conectar sin ventana emergente".' :
          e?.type === 'popup_failed_to_open' ? 'El navegador bloqueó la ventana de Google. Permita las ventanas emergentes para cesarmariano.github.io y vuelva a intentar.' :
          'No se pudo abrir la ventana de Google (' + (e?.type || 'error desconocido') + ').'))
      });
      tokenClient.requestAccessToken({ prompt: forzarConsentimiento ? 'consent' : '' });
    });
    if (window.google?.accounts?.oauth2) return pedir();
    // La biblioteca todavía no estaba cargada: se carga y se pide un segundo toque para no ser bloqueados.
    return cargarGIS().then(() => { throw new Error('Se terminó de preparar el acceso de Google. Toque el botón nuevamente.'); });
  }

  function mensajeError(codigo, detalle) {
    const m = {
      access_denied: 'Google negó el acceso. Verifique que su cuenta esté agregada como usuario de prueba en Google Cloud (Google Auth Platform → Público).',
      invalid_client: 'El ID de cliente de Google no es válido.',
      unauthorized_client: 'El ID de cliente no admite esta página.',
      origin_mismatch: 'Esta dirección no está autorizada en Google Cloud. Agregue https://cesarmariano.github.io en Orígenes autorizados de JavaScript.',
      redirect_uri_mismatch: `Falta autorizar la dirección de retorno. En Google Cloud → Credenciales → su ID de cliente, agregue ${urlRetorno()} en URI de redireccionamiento autorizados.`
    }[codigo];
    return (m || 'Google rechazó el acceso') + ` [${codigo}${detalle ? ': ' + detalle : ''}]`;
  }

  const precargar = () => cargarGIS().catch(() => {});

  async function api(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
    if (r.status === 401) { token = null; vence = 0; try { sessionStorage.removeItem(TOKEN_KEY); } catch (_) { /* */ } throw new Error('La sesión de Google venció. Toque sincronizar nuevamente.'); }
    if (!r.ok) throw new Error(`Error de Google Drive (${r.status}).`);
    return r;
  }

  async function buscar(q) {
    const r = await api(`${API}/files?spaces=drive&fields=files(id,name,modifiedTime)&q=${encodeURIComponent(q + ' and trashed=false')}`);
    return (await r.json()).files || [];
  }

  async function carpeta() {
    const f = await buscar(`name='${CARPETA}' and mimeType='application/vnd.google-apps.folder'`);
    if (f.length) return f[0].id;
    const r = await api(`${API}/files?fields=id`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: CARPETA, mimeType: 'application/vnd.google-apps.folder' })
    });
    return (await r.json()).id;
  }

  async function crear(nombre, contenido, padre) {
    const limite = 'alveonb2b' + Math.random().toString(36).slice(2);
    const cuerpo = `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: nombre, parents: [padre], mimeType: 'application/json' }) +
      `\r\n--${limite}\r\nContent-Type: application/json\r\n\r\n${contenido}\r\n--${limite}--`;
    const r = await api(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + limite }, body: cuerpo
    });
    return (await r.json()).id;
  }

  async function actualizar(id, contenido) {
    await api(`${UPLOAD}/files/${id}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: contenido
    });
  }

  /* Descarga el archivo remoto, combina con los datos locales y sube el resultado.
     combinar(local, remoto) -> datos combinados. Devuelve los datos combinados. */
  async function sincronizar(local, combinar, respaldoDiario) {
    const padre = await carpeta();
    const existentes = await buscar(`name='${ARCHIVO}' and '${padre}' in parents`);
    let datos = local;
    if (existentes.length) {
      const r = await api(`${API}/files/${existentes[0].id}?alt=media`);
      let remoto = null;
      try { remoto = await r.json(); } catch (_) { /* archivo dañado: se reemplaza */ }
      if (remoto && Array.isArray(remoto.cuentas)) datos = combinar(local, remoto);
      await actualizar(existentes[0].id, JSON.stringify(datos));
    } else {
      await crear(ARCHIVO, JSON.stringify(datos), padre);
    }
    if (respaldoDiario) {
      const nombre = `respaldo-${respaldoDiario}.json`;
      const ya = await buscar(`name='${nombre}' and '${padre}' in parents`);
      if (ya.length) await actualizar(ya[0].id, JSON.stringify(datos, null, 1));
      else await crear(nombre, JSON.stringify(datos, null, 1), padre);
    }
    return datos;
  }

  function desconectar() {
    if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
    token = null; vence = 0;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (_) { /* sin almacenamiento */ }
  }

  return { autorizar, autorizarRedireccion, recibirRedireccion, urlRetorno, sincronizar, tieneToken, desconectar, precargar };
})();
