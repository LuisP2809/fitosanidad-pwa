const VERSION = 'fitosanidad-0.5.3';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './styles-supervision.css',
  './styles-mobile-fenologia.css',
  './styles-summary-mobile.css',
  './styles-map-labels.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './js/app.js',
  './js/db.js',
  './js/sync.js',
  './js/qr.js',
  './js/supervision-safe.js',
  './js/map-labels.js',
  './js/version-ui.js',
  './vendor/qrcode.mjs',
  './data/catalogo-lotes.json',
  './data/lotes-mapa.geojson'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put('./index.html', copy));
        return response;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(VERSION).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});