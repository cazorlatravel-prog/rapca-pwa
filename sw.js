const CACHE_NAME = 'rapca-v70';
const CACHE_CDN = 'rapca-cdn-v1';

// Archivos propios (pre-cacheados en install)
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './dashboard.js',
  './timeline.js',
  './comparador.js',
  './galeria.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// Librerías CDN (cacheadas aparte para no re-descargar en cada versión)
const cdnUrls = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
  'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
];

// --- INSTALL: precachear todo ---
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      // Cache principal (archivos propios)
      caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)),
      // Cache CDN (solo si no existe ya — las versiones fijas no cambian)
      caches.open(CACHE_CDN).then(cache => {
        return Promise.all(cdnUrls.map(url =>
          cache.match(url).then(existing => {
            if (existing) return; // Ya cacheado
            return cache.add(url).catch(err => {
              console.warn('SW: no se pudo cachear CDN:', url, err.message);
            });
          })
        ));
      })
    ]).then(() => self.skipWaiting())
  );
});

// --- ACTIVATE: limpiar caches viejos + notificar ---
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && k !== CACHE_CDN)
        .map(k => caches.delete(k))
      )
    )
    .then(() => self.clients.matchAll())
    .then(clients => {
      clients.forEach(client =>
        client.postMessage({type: 'SW_UPDATED', version: CACHE_NAME})
      );
    })
    .then(() => self.clients.claim())
  );
});

// --- FETCH: estrategias por tipo de recurso ---
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1) Backend PHP: network-only, respuesta offline amigable
  if (url.pathname.endsWith('.php')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({error: 'Sin conexión', offline: true}),
          {status: 503, headers: {'Content-Type': 'application/json'}}
        )
      )
    );
    return;
  }

  // 2) CDN (cross-origin): cache-first con network fallback
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // Cachear la respuesta CDN para offline futuro
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_CDN).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() =>
          new Response('', {status: 503, statusText: 'Offline'})
        );
      })
    );
    return;
  }

  // 3) Navegación (HTML): stale-while-revalidate
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', clone));
          }
          return response;
        }).catch(() => cached || offlineResponse());
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 4) Archivos propios (JS, CSS, imágenes): stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// --- BACKGROUND SYNC: reintentar envíos pendientes ---
self.addEventListener('sync', event => {
  if (event.tag === 'sync-registros') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
          clients[0].postMessage({type: 'SYNC_REGISTROS'});
        }
      })
    );
  }
  if (event.tag === 'sync-fotos') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
          clients[0].postMessage({type: 'SYNC_FOTOS'});
        }
      })
    );
  }
});

// Respuesta offline para navegación
function offlineResponse() {
  return new Response(
    '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>RAPCA - Sin conexión</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,system-ui,sans-serif;' +
    'background:#f5f5f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}' +
    '.offline-box{background:#fff;border-radius:16px;padding:40px 30px;text-align:center;max-width:400px;box-shadow:0 4px 20px rgba(0,0,0,.1)}' +
    'h1{color:#1a3d2e;font-size:1.5rem;margin:16px 0 8px}p{color:#666;font-size:.95rem;line-height:1.5;margin-bottom:20px}' +
    '.icon{font-size:3rem;margin-bottom:8px}button{background:#1a3d2e;color:#fff;border:none;padding:14px 28px;border-radius:10px;' +
    'font-size:1rem;cursor:pointer;min-height:48px}button:active{opacity:.8}</style></head>' +
    '<body><div class="offline-box"><div class="icon">📡</div><h1>Sin conexión</h1>' +
    '<p>No se pudo cargar RAPCA. Comprueba tu conexión a internet e inténtalo de nuevo.</p>' +
    '<button onclick="location.reload()">Reintentar</button></div></body></html>',
    {status: 503, headers: {'Content-Type': 'text/html; charset=utf-8'}}
  );
}
