if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Service Worker registrado'))
        .catch((error) => console.log('Error al registrar el Service Worker:', error));
}

// API de la tienda (Ejercicio 3)
const API_URL = 'https://fakestoreapi.com/products';

const formProducto = document.getElementById('form-producto');
const inputTitulo = document.getElementById('titulo');
const inputPrecio = document.getElementById('precio');
const inputDescripcion = document.getElementById('descripcion');
const listaOutbox = document.getElementById('lista-outbox');
const btnPurgar = document.getElementById('btn-purgar');
const badgeRed = document.getElementById('badge-red');

// Cambia el indicador de red según navigator.onLine
function actualizarIndicadorRed() {
    if (navigator.onLine) {
        badgeRed.textContent = 'En Línea';
        badgeRed.className = 'badge online';
    } else {
        badgeRed.textContent = 'Sin Conexión';
        badgeRed.className = 'badge offline';
    }
}

// READ: lee IndexedDB y dibuja la bandeja de salida
function renderizarColaOutbox() {
    return obtenerTodosLosRegistros()
        .then((registros) => {
            listaOutbox.innerHTML = '';

            if (registros.length === 0) {
                const vacio = document.createElement('li');
                vacio.textContent = 'No hay productos en la bandeja.';
                listaOutbox.appendChild(vacio);
                return;
            }

            registros.forEach((item) => {
                const li = document.createElement('li');

                const texto = document.createElement('span');
                texto.textContent = item.titulo + ' - $' + Number(item.precio).toFixed(2);

                const estado = document.createElement('span');
                estado.textContent = item.estado;
                estado.className = 'estado-' + item.estado;

                const hora = document.createElement('span');
                hora.textContent = new Date(item.fechaCreacion).toLocaleTimeString();
                hora.className = 'hora';

                li.appendChild(texto);
                li.appendChild(estado);
                li.appendChild(hora);
                listaOutbox.appendChild(li);
            });
        })
        .catch((error) => {
            console.error('[Outbox] No se pudo leer IndexedDB:', error);
        });
}

// CREATE: intenta enviar el producto y si falla lo guarda como pendiente
function procesarEnvioProducto(datosFormulario) {
    return fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: datosFormulario.titulo,
            price: datosFormulario.precio,
            description: datosFormulario.descripcion
        })
    })
        .then((respuesta) => {
            if (!respuesta.ok) throw new Error('Error HTTP del servidor');
            return respuesta.json();
        })
        .then(() => {
            // Envío exitoso: se guarda en la bitácora local como sincronizado
            return guardarRegistro({
                ...datosFormulario,
                estado: 'sincronizado',
                fechaCreacion: Date.now()
            });
        })
        .catch(() => {
            console.warn('[Outbox] Sin conexión. Encolando producto localmente...');
            // Falla de red: se guarda como pendiente para reenviarlo después
            return guardarRegistro({
                ...datosFormulario,
                estado: 'pendiente',
                fechaCreacion: Date.now()
            });
        })
        .then(() => {
            return renderizarColaOutbox();
        });
}

// UPDATE: reenvía los pendientes cuando regresa la conexión
function sincronizarPendientes() {
    console.log('[Outbox] Conexión detectada. Buscando registros pendientes...');

    return obtenerTodosLosRegistros()
        .then((registros) => {
            const pendientes = registros.filter((item) => item.estado === 'pendiente');

            if (pendientes.length === 0) {
                console.log('[Outbox] No hay transacciones pendientes por sincronizar.');
                return;
            }

            // Cada pendiente se convierte en una promesa de envío + actualización
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
                    .then((res) => {
                        if (!res.ok) throw new Error('Falla al reintentar envío');
                        return actualizarEstadoRegistro(item.id, 'sincronizado');
                    });
            });

            // Esperar a que terminen todos los reenvíos
            return Promise.all(promesasDeEnvio);
        })
        .then(() => {
            return renderizarColaOutbox();
        })
        .catch((error) => {
            console.error('[Outbox] Error durante la sincronización masiva:', error);
        });
}

window.addEventListener('online', () => {
    actualizarIndicadorRed();
    sincronizarPendientes();
});

window.addEventListener('offline', actualizarIndicadorRed);

// Envío del formulario
formProducto.addEventListener('submit', (e) => {
    e.preventDefault();

    const datosFormulario = {
        titulo: inputTitulo.value.trim(),
        precio: parseFloat(inputPrecio.value),
        descripcion: inputDescripcion.value.trim()
    };

    procesarEnvioProducto(datosFormulario);
    formProducto.reset();
});

// DELETE: elimina los registros ya sincronizados
btnPurgar.addEventListener('click', () => {
    obtenerTodosLosRegistros()
        .then((registros) => {
            const sincronizados = registros.filter((item) => item.estado === 'sincronizado');
            return Promise.all(sincronizados.map((item) => eliminarRegistro(item.id)));
        })
        .then(() => {
            return renderizarColaOutbox();
        })
        .catch((error) => {
            console.error('[Outbox] Error al purgar registros:', error);
        });
});

// Al cargar la página
actualizarIndicadorRed();
renderizarColaOutbox();
