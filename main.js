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
irInicio();
pintarNube();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
