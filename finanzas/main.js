/* Inicio de la aplicación y navegación entre secciones. */
'use strict';

$('#btn-settings').onclick = renderAjustes;
$('#btn-sync').onclick = () => sincronizar(true);
document.querySelectorAll('#bottom-nav [data-sec]').forEach(b => (b.onclick = () => {
  seccion = b.dataset.sec;
  try { localStorage.setItem('finanzas-seccion', seccion); } catch (_) { /* sin almacenamiento */ }
  irInicio();
}));
window.addEventListener('online', programarSync);
escribir(STORAGE_KEY, db); // guarda los valores iniciales, si es la primera vez
try { const s = localStorage.getItem('finanzas-seccion'); if (PANTALLAS[s]) seccion = s; } catch (_) { /* sin almacenamiento */ }
if (!procesarRetornoGoogle()) irInicio();
pintarNube();
// Precarga el acceso de Google para que la ventana se abra en el mismo toque (requisito de Chrome).
Drive.precargar(clientId()).catch(() => { /* sin conexión: se reintenta al tocar Conectar */ });
// Si el permiso de Google sigue vigente (dura 1 hora), sincroniza al abrir sin mostrar ninguna ventana.
if (local.driveConectado && Drive.tieneToken()) setTimeout(() => sincronizar(false), 800);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
