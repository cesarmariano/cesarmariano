/* Inicio de la aplicación y navegación entre secciones. */
'use strict';

$('#btn-settings').onclick = renderAjustes;
$('#btn-sync').onclick = () => sincronizar(true);
document.querySelectorAll('#bottom-nav [data-sec]').forEach(b => (b.onclick = () => {
  seccion = b.dataset.sec;
  try { localStorage.setItem('alveon-seccion', seccion); } catch (_) { /* sin almacenamiento */ }
  irInicio();
}));
window.addEventListener('online', programarSync);
escribir(STORAGE_KEY, db); // guarda la migración de datos, si hubo
try { seccion = localStorage.getItem('alveon-seccion') === 'pacientes' ? 'pacientes' : 'medicos'; } catch (_) { /* sin almacenamiento */ }
if (!procesarRetornoGoogle()) irInicio();
pintarNube();
// Precarga el acceso de Google para que la ventana se abra en el mismo toque (requisito de Chrome).
Drive.precargar(clientId()).catch(() => { /* sin conexión: se reintenta al tocar Conectar */ });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
