// Importar el mini-wrapper de IndexedDB en el Service Worker
importScripts('./db-helper.js');

const API_URL = 'https://fakestoreapi.com/products';

const CACHE_STATIC_NAME = 'static-outbox-v2';
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

// Avisa a todas las pestañas abiertas que terminó la sincronización
function notificarClientesActualizacion() {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientes) => {
            clientes.forEach((cliente) => {
                cliente.postMessage({
                    tipo: 'OUTBOX_SINCRONIZADO',
                    timestamp: Date.now()
                });
            });
        });
}

// Reenvía los productos pendientes desde el Service Worker
function sincronizarPendientesSW() {
    console.log('[SW-Sync] Ejecutando barrido de transacciones pendientes...');

    return obtenerTodosLosRegistros()
        .then((registros) => {
            const pendientes = registros.filter((item) => item.estado === 'pendiente');

            if (pendientes.length === 0) {
                console.log('[SW-Sync] Cola limpia. Nada por sincronizar.');
                return;
            }

            const promesasDeEnvio = pendientes.map((item) => {
                return fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: item.titulo,
                        price: item.precio,
                        description: item.descripcion
                    })
                })
                    .then((respuesta) => {
                        if (!respuesta.ok) {
                            throw new Error('Error HTTP ' + respuesta.status + ' al sincronizar ID ' + item.id);
                        }
                        return actualizarEstadoRegistro(item.id, 'sincronizado');
                    });
            });

            return Promise.all(promesasDeEnvio)
                .then(() => notificarClientesActualizacion());
        });
}

// El navegador dispara 'sync' cuando detecta conexión estable
self.addEventListener('sync', (event) => {
    console.log('[SW-Sync] Evento sync disparado con etiqueta:', event.tag);

    if (event.tag === 'sync-reportes') {
        event.waitUntil(
            sincronizarPendientesSW()
                .catch((error) => {
                    console.error('[SW-Sync] Falla en sincronización; el navegador reintentará luego:', error);
                    // Relanzar el error hace que el navegador programe un reintento
                    throw error;
                })
        );
    }
});
