/* Inicio de la aplicación y navegación entre secciones. */
'use strict';

$('#btn-settings').onclick = renderAjustes;
$('#btn-sync').onclick = () => sincronizar(true);
document.querySelectorAll('#bottom-nav [data-sec]').forEach(b => (b.onclick = () => {
  seccion = b.dataset.sec;
  try { localStorage.setItem('alveon-b2b-seccion', seccion); } catch (_) { /* sin almacenamiento */ }
  irInicio();
}));
window.addEventListener('online', programarSync);
try { const s = localStorage.getItem('alveon-b2b-seccion'); if (SECCIONES[s]) seccion = s; } catch (_) { /* sin almacenamiento */ }
// Regreso desde Google después de "Conectar sin ventana emergente".
const retornoGoogle = Drive.recibirRedireccion();
if (retornoGoogle) {
  renderAjustes();
  if (retornoGoogle.ok) {
    refrescarVista = renderAjustes;
    sincronizar(true).finally(() => { refrescarVista = () => { if (!$('#btn-back').hidden) return; irInicio(); }; renderAjustes(); });
  } else {
    local.ultimoError = `${new Date().toLocaleString('es-AR')}: ${retornoGoogle.error}`; guardarLocal();
    renderAjustes(); toast(retornoGoogle.error);
  }
} else irInicio();
pintarNube();
// La biblioteca de Google se carga de antemano para que la ventana de acceso no sea bloqueada.
if (clientId() && navigator.onLine) Drive.precargar();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
