const CACHE_NAME = 'rapca-v48';
const TILES_CACHE = 'rapca-tiles';
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
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== TILES_CACHE).map(k => caches.delete(k)))
    ).then(() => {
      return self.clients.matchAll();
    }).then(clients => {
      clients.forEach(client => client.postMessage({type: 'SW_UPDATED', version: CACHE_NAME}));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  var url = new URL(event.request.url);

  // Tiles de mapa: cache-first (para offline)
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILES_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => new Response('', {status: 404}));
        })
      )
    );
    return;
  }

  // Nunca cachear las peticiones al backend PHP ni APIs externas
  if (url.pathname.endsWith('.php') || url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({error: 'Sin conexión'}), {headers: {'Content-Type': 'application/json'}})));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
