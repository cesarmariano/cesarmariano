// Permite usar la aplicación sin conexión una vez abierta por primera vez (por ejemplo, en la cancha).
importScripts('version.js');
const CACHE = 'golf-' + self.GOLF_VERSION;
const FILES = [
  './', './index.html', './styles.css', './version.js', './config.js', './consejos-base.js', './puntaje.js', './drive.js',
  './datos.js', './graficos.js', './audio.js', './ia.js', './app.js', './analisis.js', './consejos.js', './ajustes.js', './main.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('golf-') && k !== CACHE).map(k => caches.delete(k))))
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
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
