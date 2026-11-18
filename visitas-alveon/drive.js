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
          if (!p) return;
          clearTimeout(p.reloj);
          if (r.error) return p.mal(new Error(mensajeError(r.error)));
          token = r.access_token; vence = Date.now() + (Number(r.expires_in) || 3600) * 1000;
          p.ok();
        },
        error_callback: e => {
          const p = pendiente; pendiente = null;
          if (!p) return;
          clearTimeout(p.reloj);
          p.mal(new Error(e?.type === 'popup_closed' ? 'Se cerró la ventana de Google sin completar el acceso.'
            : e?.type === 'popup_failed_to_open' ? 'El navegador bloqueó la ventana de Google. Permita las ventanas emergentes para este sitio (ícono en la barra de direcciones) y vuelva a intentar.'
            : 'No se pudo completar el acceso con Google.'));
        }
      });
    });
  }

  function mensajeError(codigo) {
    if (codigo === 'access_denied') return 'Google denegó el acceso. Verifique que su cuenta esté agregada en "Usuarios de prueba" del proyecto de Google Cloud y que haya tocado "Permitir".';
    return 'Google rechazó el acceso (' + codigo + ').';
  }

  // Debe llamarse directamente desde un toque del usuario, sin esperas previas.
  function autorizar(clientId, forzarConsentimiento) {
    if (!clientId) return Promise.reject(new Error('Falta configurar el ID de cliente de Google en Ajustes.'));
    const pedir = () => new Promise((ok, mal) => {
      if (pendiente) { clearTimeout(pendiente.reloj); pendiente.mal(new Error('Solicitud reemplazada.')); }
      // Si la ventana no responde en 2 minutos, se cancela para que el botón vuelva a funcionar.
      const reloj = setTimeout(() => {
        if (pendiente && pendiente.reloj === reloj) { pendiente = null; mal(new Error('No hubo respuesta de la ventana de Google. Revise si el navegador la bloqueó y vuelva a intentar.')); }
      }, 120000);
      pendiente = { ok, mal, reloj };
      tokenClient.requestAccessToken({ prompt: forzarConsentimiento ? 'consent' : '' });
    });
    // Caso normal: el acceso ya está precargado y la ventana se abre en el mismo toque.
    if (tokenClient && clientePara === clientId) return pedir();
    // Primera vez sin precarga: se carga ahora; si el navegador bloquea la ventana, el segundo toque funcionará.
    return precargar(clientId).then(pedir);
  }

  async function api(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
    if (r.status === 401) { token = null; throw new Error('La sesión de Google venció. Toque sincronizar nuevamente.'); }
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
  async function sincronizar(local, combinar, respaldoDiario) {
    const padre = await carpeta();
    const existentes = await buscar(`name='${ARCHIVO}' and '${padre}' in parents`);
    let datos = local;
    if (existentes.length) {
      const r = await api(`${API}/files/${existentes[0].id}?alt=media`);
      let remoto = null;
      try { remoto = await r.json(); } catch (_) { /* archivo dañado: se reemplaza */ }
      if (remoto && Array.isArray(remoto.medicos)) datos = combinar(local, remoto);
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
  }

  return { autorizar, precargar, sincronizar, tieneToken, desconectar };
})();
