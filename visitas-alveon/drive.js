/* Sincronización y respaldos en Google Drive del usuario.
   Usa el permiso "drive.file": la aplicación sólo ve los archivos que ella misma crea.
   Estructura en Drive:  Alveon Visitas/alveon-visitas.json  (+ respaldos diarios con fecha). */
'use strict';

const Drive = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const CARPETA = 'Alveon Visitas';
  const ARCHIVO = 'alveon-visitas.json';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  let token = null, vence = 0, tokenClient = null, gisPromise = null;

  /* El permiso de Google dura 1 hora. Se guarda en este dispositivo para no pedirlo de nuevo
     al cerrar y abrir la aplicación dentro de ese lapso. */
  const CLAVE_TOKEN = 'alveon-token';
  try { const g = JSON.parse(localStorage.getItem(CLAVE_TOKEN)); if (g && g.vence > Date.now()) ({ token, vence } = g); } catch (_) { /* sin datos */ }
  function guardarToken(t, segundos) {
    token = t; vence = Date.now() + (Number(segundos) || 3600) * 1000;
    try { localStorage.setItem(CLAVE_TOKEN, JSON.stringify({ token, vence })); } catch (_) { /* sin almacenamiento */ }
  }
  function olvidarToken() {
    token = null; vence = 0;
    try { localStorage.removeItem(CLAVE_TOKEN); } catch (_) { /* sin almacenamiento */ }
  }

  const tieneToken = () => token && Date.now() < vence - 60000;

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

  // Deja listo el acceso de Google antes de que el usuario toque "Conectar".
  // Chrome bloquea la ventana de Google si se abre después de una espera (por ejemplo, mientras se carga el script).
  let pendiente = null, clientePara = '';
  function precargar(clientId) {
    if (!clientId) return Promise.resolve();
    return cargarGIS().then(() => {
      if (tokenClient && clientePara === clientId) return;
      clientePara = clientId;
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: r => {
          const p = pendiente; pendiente = null;
          if (p) clearTimeout(p.reloj);
          const fallar = msg => (p ? p.mal(new Error(msg)) : window.dispatchEvent(new CustomEvent('drive-error', { detail: msg })));
          if (r.error) return fallar(mensajeError(r.error));
          if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return fallar(MSG_CASILLA);
          guardarToken(r.access_token, r.expires_in);
          // La autorización puede llegar después de que Google informó (por error) que la ventana se cerró.
          if (p) p.ok(); else window.dispatchEvent(new Event('drive-token'));
        },
        error_callback: e => {
          const p = pendiente;
          if (!p) return;
          if (e?.type === 'popup_closed') {
            // Google a veces informa "ventana cerrada" mientras la autorización todavía está en curso
            // (por ejemplo, en aplicaciones instaladas). Se espera unos segundos más antes de darla por fallida.
            clearTimeout(p.reloj);
            p.reloj = setTimeout(() => {
              if (pendiente !== p) return;
              pendiente = null;
              p.mal(new Error('No se recibió la autorización de Google. Si completó los pasos en la ventana de Google, use el botón "Conectar con otro método".'));
            }, 20000);
            return;
          }
          pendiente = null; clearTimeout(p.reloj);
          p.mal(new Error(e?.type === 'popup_failed_to_open'
            ? 'El navegador bloqueó la ventana de Google. Permita las ventanas emergentes para este sitio (ícono en la barra de direcciones) o use "Conectar con otro método".'
            : 'No se pudo completar el acceso con Google.'));
        }
      });
    });
  }

  const MSG_CASILLA = 'Google no otorgó el permiso para Drive. Vuelva a conectar y, en la ventana de Google, marque la casilla "Ver, editar, crear y borrar solo los archivos de Google Drive específicos que use con esta app" antes de tocar Continuar.';

  /* Método alternativo sin ventana emergente: la página va a Google y Google la devuelve con el permiso.
     Requiere registrar la dirección de retorno en "URI de redireccionamiento autorizados" del ID de cliente. */
  function urlRedireccion(clientId, retorno, estado, cuenta) {
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: retorno, response_type: 'token', scope: SCOPE,
      include_granted_scopes: 'true', state: estado });
    if (cuenta) q.set('login_hint', cuenta); else q.set('prompt', 'select_account');
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + q;
  }
  // Procesa la respuesta de Google en la dirección (#access_token=…). Devuelve null si no hay respuesta.
  function leerRedireccion(hash, estadoEsperado) {
    const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    if (!q.get('access_token') && !q.get('error')) return null;
    if (!estadoEsperado || q.get('state') !== estadoEsperado) return { error: 'La respuesta de Google no corresponde a esta solicitud. Vuelva a intentar.' };
    if (q.get('error')) return { error: mensajeError(q.get('error')) };
    if (!String(q.get('scope') || '').split(' ').includes(SCOPE)) return { error: MSG_CASILLA };
    guardarToken(q.get('access_token'), q.get('expires_in'));
    return { ok: true };
  }

  function mensajeError(codigo) {
    if (codigo === 'access_denied') return 'Google denegó el acceso. Verifique que su cuenta esté agregada en "Usuarios de prueba" del proyecto de Google Cloud y que haya tocado "Permitir".';
    return 'Google rechazó el acceso (' + codigo + ').';
  }

  // Debe llamarse directamente desde un toque del usuario, sin esperas previas.
  /* opciones: { consentimiento: pedir el permiso aunque ya se haya dado, cuenta: correo conocido (evita elegir la cuenta),
     elegirCuenta: mostrar la lista de cuentas } */
  function autorizar(clientId, opciones = {}) {
    if (!clientId) return Promise.reject(new Error('Falta configurar el ID de cliente de Google en Ajustes.'));
    const pedir = () => new Promise((ok, mal) => {
      if (pendiente) { clearTimeout(pendiente.reloj); pendiente.mal(new Error('Solicitud reemplazada.')); }
      // Si la ventana no responde en 2 minutos, se cancela para que el botón vuelva a funcionar.
      const reloj = setTimeout(() => {
        if (pendiente && pendiente.reloj === reloj) { pendiente = null; mal(new Error('No hubo respuesta de la ventana de Google. Revise si el navegador la bloqueó y vuelva a intentar.')); }
      }, 120000);
      pendiente = { ok, mal, reloj };
      const pedido = { prompt: opciones.elegirCuenta ? 'select_account' : opciones.consentimiento ? 'consent' : '' };
      // Con la cuenta indicada, Google no muestra la lista de cuentas y, si el permiso ya fue dado, la ventana se cierra sola.
      if (opciones.cuenta && !opciones.elegirCuenta) { pedido.login_hint = opciones.cuenta; pedido.hint = opciones.cuenta; }
      tokenClient.requestAccessToken(pedido);
    });
    // Caso normal: el acceso ya está precargado y la ventana se abre en el mismo toque.
    if (tokenClient && clientePara === clientId) return pedir();
    // Primera vez sin precarga: se carga ahora; si el navegador bloquea la ventana, el segundo toque funcionará.
    return precargar(clientId).then(pedir);
  }

  async function api(url, opts = {}) {
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), 30000);
    let r;
    try {
      r = await fetch(url, { ...opts, signal: corte.signal, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
    } catch (e) {
      throw new Error(e.name === 'AbortError'
        ? 'Google Drive no respondió en 30 segundos. Verifique la conexión y vuelva a intentar.'
        : 'No se pudo comunicar con Google Drive. Si usa una extensión de bloqueo de anuncios o de privacidad, desactívela para este sitio.');
    } finally { clearTimeout(reloj); }
    if (r.ok) return r;
    let detalle = '';
    try { detalle = JSON.stringify(await r.json()); } catch (_) { /* sin detalle */ }
    if (r.status === 401) { olvidarToken(); throw new Error('La sesión de Google venció. Toque sincronizar nuevamente.'); }
    if (/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(detalle)) {
      throw new Error('La API de Google Drive no está habilitada en el proyecto de Google Cloud. Habilítela en console.cloud.google.com/apis/library/drive.googleapis.com (botón "Habilitar"), espere unos minutos y vuelva a intentar.');
    }
    if (/insufficient|SCOPE/i.test(detalle)) {
      olvidarToken();
      throw new Error('Falta el permiso para Drive. Vuelva a conectar y marque la casilla de Google Drive en la ventana de Google.');
    }
    const msg = (detalle.match(/"message":"([^"]+)"/) || [])[1];
    throw new Error(`Error de Google Drive (${r.status})${msg ? ': ' + msg : ''}.`);
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
    const limite = 'alveon' + Math.random().toString(36).slice(2);
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
  async function sincronizar(local, combinar, respaldoDiario, paso = () => {}) {
    paso('Buscando la carpeta "Alveon Visitas" en Drive…');
    const padre = await carpeta();
    paso('Leyendo y combinando los datos…');
    const existentes = await buscar(`name='${ARCHIVO}' and '${padre}' in parents`);
    let datos = local;
    if (existentes.length) {
      const r = await api(`${API}/files/${existentes[0].id}?alt=media`);
      let remoto = null;
      try { remoto = await r.json(); } catch (_) { /* archivo dañado: se reemplaza */ }
      if (remoto && Array.isArray(remoto.medicos)) datos = await combinar(local, remoto);
      await actualizar(existentes[0].id, JSON.stringify(datos));
    } else {
      await crear(ARCHIVO, JSON.stringify(datos), padre);
    }
    if (respaldoDiario) {
      paso('Guardando el respaldo diario…');
      const nombre = `respaldo-${respaldoDiario}.json`;
      const ya = await buscar(`name='${nombre}' and '${padre}' in parents`);
      if (ya.length) await actualizar(ya[0].id, JSON.stringify(datos, null, 1));
      else await crear(nombre, JSON.stringify(datos, null, 1), padre);
    }
    return datos;
  }

  function desconectar() {
    if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
    olvidarToken();
  }

  // Correo de la cuenta conectada (para no tener que elegirla la próxima vez).
  async function cuenta() {
    const r = await api(`${API}/about?fields=user(emailAddress)`);
    return ((await r.json()).user || {}).emailAddress || '';
  }

  return { autorizar, precargar, sincronizar, tieneToken, desconectar, olvidarToken, cuenta, urlRedireccion, leerRedireccion };
})();
