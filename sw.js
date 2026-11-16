const CACHE_STATIC_NAME = 'static-outbox-v1';
const STATIC_FILES = [
    './',
    './index.html',
    './styles.css',
    './db-helper.js',
    './app.js',
    './manifest.json'
];

// Instalación: guarda el App Shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_STATIC_NAME)
            .then((cache) => cache.addAll(STATIC_FILES))
            .then(() => self.skipWaiting())
    );
});

// Activación: borra cachés de versiones anteriores
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((nombresCaches) => {
                return Promise.all(
                    nombresCaches.map((nombreCache) => {
                        if (nombreCache !== CACHE_STATIC_NAME) {
                            console.log('[SW] Borrando caché anterior:', nombreCache);
                            return caches.delete(nombreCache);
                        }
                    })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch: cache first para el App Shell
self.addEventListener('fetch', (event) => {
    // Los POST no se guardan en la Cache API, van directo a la red
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request)
            .then((respuestaCache) => {
                return respuestaCache || fetch(event.request);
            })
    );
});
