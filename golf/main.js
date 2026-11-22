/* Inicio de la aplicación y navegación entre secciones. */
'use strict';

cargarDatos();
escribir(CLAVE_DATOS, db); // guarda los consejos base la primera vez
seccion = ['rondas', 'analisis', 'consejos'].includes(local.seccion) ? local.seccion : 'rondas';

$('#btn-settings').onclick = renderAjustes;
$('#btn-sync').onclick = () => sincronizar(true);
document.querySelectorAll('#bottom-nav [data-sec]').forEach(b => (b.onclick = () => {
  seccion = b.dataset.sec; local.seccion = seccion; guardarLocal();
  irInicio();
}));
window.addEventListener('online', programarSync);

/* Enlace compartido desde otra aplicación (Android: Compartir → Mi Golf) o abierto con ?url=… */
function procesarCompartido() {
  const q = new URLSearchParams(location.search);
  const texto = [q.get('title'), q.get('text')].filter(Boolean).join('\n');
  const url = q.get('url') || (texto.match(/https?:\/\/\S+/) || [])[0] || '';
  if (!url && !texto) return false;
  history.replaceState(null, '', location.pathname);
  seccion = 'consejos';
  renderFormConsejo(null, { url, texto: texto.replace(url, '').trim(), enlace: true });
  return true;
}

if (!procesarRetornoGoogle() && !procesarCompartido()) irInicio();
pintarNube();
// Precarga el acceso de Google para que la ventana se abra en el mismo toque (requisito de Chrome).
Drive.precargar(clientId()).catch(() => { /* sin conexión: se reintenta al tocar Conectar */ });
// Si el permiso de Google sigue vigente (dura 1 hora), sincroniza al abrir sin mostrar ninguna ventana.
if (local.driveConectado && Drive.tieneToken()) setTimeout(() => sincronizar(false), 800);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
