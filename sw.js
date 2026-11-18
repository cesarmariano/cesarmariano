// Permite usar la aplicación sin conexión una vez abierta por primera vez.
const CACHE = 'alveon-b2b-v4';
const FILES = [
  './', './index.html', './instalar.html', './styles.css', './config.js', './drive.js', './app.js', './cuentas.js',
  './agenda.js', './difusion.js', './informes.js', './main.js',
  './manifest.webmanifest', './logo.jpg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  './lib/jspdf.umd.min.js', './lib/jspdf.plugin.autotable.min.js', './lib/qrcode.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('alveon-b2b-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero, caché como respaldo: así las actualizaciones llegan apenas hay conexión.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // "no-cache": siempre se consulta a GitHub si hay una versión nueva (sin usar la copia guardada por el navegador).
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
