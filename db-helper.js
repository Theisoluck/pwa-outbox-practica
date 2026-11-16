// Mini-wrapper promisificado de IndexedDB
// Se carga en index.html con <script> y en sw.js con importScripts()

const DB_NAME = 'pwa-outbox-db';
const DB_VERSION = 1;
const STORE_NAME = 'transacciones_pendientes';

// Pieza 1: abre la base de datos y crea el Object Store la primera vez
function abrirDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // Solo se ejecuta si la BD es nueva o sube de versión
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

// Pieza 2: guarda un registro y resuelve con el id generado
function guardarRegistro(datos) {
    return abrirDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME], 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            const req = store.add(datos);
            let idGenerado;

            req.onsuccess = (event) => {
                idGenerado = event.target.result;
            };

            // El dato está en disco hasta que la transacción termina
            tx.oncomplete = () => resolve(idGenerado);
            tx.onerror = (event) => reject(event.target.error);
        });
    });
}

// Pieza 3: lee todos los registros
function obtenerTodosLosRegistros() {
    return abrirDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME], 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();

            req.onsuccess = (event) => resolve(event.target.result);
            req.onerror = (event) => reject(event.target.error);
        });
    });
}

// Pieza 4: elimina un registro por su llave primaria
function eliminarRegistro(id) {
    return abrirDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME], 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            store.delete(id);

            tx.oncomplete = () => resolve(true);
            tx.onerror = (event) => reject(event.target.error);
        });
    });
}

// Update: cambia el estado de un registro con get + put en la misma transacción
function actualizarEstadoRegistro(id, nuevoEstado) {
    return abrirDB().then((db) => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME], 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            // 1. Obtener el registro actual
            const reqGet = store.get(id);

            reqGet.onsuccess = (event) => {
                const registro = event.target.result;
                if (!registro) {
                    reject(new Error('No se encontró el registro con ID: ' + id));
                    return;
                }

                // 2. Cambiar el estado y sobrescribir con put()
                registro.estado = nuevoEstado;
                registro.fechaSincronizacion = Date.now();
                store.put(registro);
            };

            // 3. Resolver cuando la transacción termina de guardar
            tx.oncomplete = () => resolve(true);
            tx.onerror = (event) => reject(event.target.error);
        });
    });
}
