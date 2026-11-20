// Permite usar la aplicación sin conexión una vez abierta por primera vez.
importScripts('version.js');
const CACHE = 'finanzas-' + self.FIN_VERSION;
const FILES = [
  './', './index.html', './instalar.html', './styles.css', './version.js', './config.js', './datos.js', './drive.js',
  './app.js', './tarjetas.js', './ahorro.js', './ajustes.js', './main.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './lib/jspdf.umd.min.js', './lib/jspdf.plugin.autotable.min.js', './lib/qrcode.js', './lib/pdf.min.js', './lib/pdf.worker.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // Sólo borra cachés propias: la aplicación Alveon comparte el mismo sitio.
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('finanzas-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero, caché como respaldo: así las actualizaciones llegan apenas hay conexión.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
