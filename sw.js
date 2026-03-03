const CACHE_NAME = 'rapca-v40';
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './dashboard.js',
  './timeline.js',
  './comparador.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => {
      // Notificar a todos los clientes que hay actualización
      return self.clients.matchAll();
    }).then(clients => {
      clients.forEach(client => client.postMessage({type: 'SW_UPDATED', version: CACHE_NAME}));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  var url = new URL(event.request.url);
  // Nunca cachear las peticiones al backend PHP ni APIs externas
  if (url.pathname.endsWith('.php') || url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({error: 'Sin conexión'}), {headers: {'Content-Type': 'application/json'}})));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
