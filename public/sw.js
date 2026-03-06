/**
 * RAPCA Campo — Service Worker v1
 * Cache-first strategy for offline support
 */

const CACHE_NAME = 'rapca-campo-v4';
const STATIC_ASSETS = [
    '/public/operador.php',
    '/public/css/operador.css',
    '/public/css/camera.css',
    '/public/js/operador.js',
    '/public/js/camera.js',
    '/public/js/upload.js',
    '/public/js/watermark.js',
    '/public/js/offline.js',
    '/public/manifest.json',
    '/public/icons/icon-192.png',
    '/public/icons/icon-512.png',
];

// Install: cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// Fetch: cache-first, network fallback
self.addEventListener('fetch', event => {
    // Skip non-GET and API calls
    if (event.request.method !== 'GET') return;
    if (event.request.url.includes('/api/')) return;
    if (event.request.url.includes('/subir.php')) return;

    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    // Cache successful responses
                    if (response.ok && response.type === 'basic') {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                });
            })
            .catch(() => {
                // Offline fallback for navigation
                if (event.request.mode === 'navigate') {
                    return caches.match('/public/operador.php');
                }
            })
    );
});
