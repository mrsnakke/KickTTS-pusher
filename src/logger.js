const eventBus = require('./event-bus');

/**
 * Envía logs al bus de eventos para ser mostrados en consola y en el frontend.
 * @param {string} message - El mensaje a loguear.
 * @param {string} logType - Tipo de log ('info', 'system', 'error', 'success', etc.).
 * @param {string|null} user - Nombre del usuario asociado al log (opcional).
 */
function uiLog(message, logType = 'info', user = null) {
    console.log(`[${logType.toUpperCase()}] ${user ? user + ': ' : ''}${message}`);
    eventBus.emit('log', {
        type: 'log',
        logType,
        message,
        user
    });
}

module.exports = {
    uiLog
};
