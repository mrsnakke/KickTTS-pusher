// Configuración interna del filtro anti-spam (fácil de editar y adaptar)
const SPAM_CONFIG = {
    enabled: true,
    maxMessageLength: 200,        // Máximo de caracteres permitidos para hablar
    cooldownMs: 2000,             // Cooldown en milisegundos por usuario para comandos TTS (2 segundos)
    maxConsecutiveRepeat: 5,      // Máximo de caracteres idénticos repetidos seguidos (ej. "aaaaa")
    blockConsecutiveDuplicate: false, // Desactivado para no ser tan agresivo (permite repetir el mismo mensaje si respeta el cooldown)
    maxCapsRatio: 0.85            // Si más del 85% de las letras son mayúsculas se considera spam (menos restrictivo)
};

// Historial temporal en memoria para controlar los cooldowns y duplicados por usuario
const userHistory = {}; // { 'username': { lastTimestamp: 12345, lastMessage: 'hola' } }

/**
 * Evalúa si un mensaje de un usuario debe considerarse spam.
 * @param {string} user Nombre del usuario que envía el mensaje.
 * @param {string} message Contenido del mensaje.
 * @returns {Object} Objeto con propiedades { isSpam: boolean, reason: string }
 */
function checkSpam(user, message) {
    if (!SPAM_CONFIG.enabled) {
        return { isSpam: false };
    }

    const cleanMsg = message.trim();

    // 1. Longitud máxima
    if (cleanMsg.length > SPAM_CONFIG.maxMessageLength) {
        return { isSpam: true, reason: `Mensaje demasiado largo (máx ${SPAM_CONFIG.maxMessageLength} caracteres)` };
    }

    // 2. Cooldown por usuario (evita inundar Speaker.bot de inmediato)
    const now = Date.now();
    const history = userHistory[user] || { lastTimestamp: 0, lastMessage: '' };

    if (now - history.lastTimestamp < SPAM_CONFIG.cooldownMs) {
        const remaining = Math.ceil((SPAM_CONFIG.cooldownMs - (now - history.lastTimestamp)) / 1000);
        return { isSpam: true, reason: `Cooldown activo. Espera ${remaining}s.` };
    }

    // 3. Bloqueo de duplicados consecutivos por el mismo usuario
    if (SPAM_CONFIG.blockConsecutiveDuplicate && history.lastMessage.toLowerCase() === cleanMsg.toLowerCase()) {
        return { isSpam: true, reason: 'Mensaje idéntico al anterior' };
    }

    // 4. Repetición exagerada de caracteres (ej. "aaaaa", "hhhhhh")
    const repeatRegex = new RegExp(`(.)\\1{${SPAM_CONFIG.maxConsecutiveRepeat},}`, 'gi');
    if (repeatRegex.test(cleanMsg)) {
        return { isSpam: true, reason: 'Caracteres repetidos excesivamente' };
    }

    // 5. Exceso de mayúsculas (Gritar en chat)
    if (cleanMsg.length > 10) {
        const capsCount = (cleanMsg.match(/[A-Z]/g) || []).length;
        const lettersCount = (cleanMsg.match(/[a-zA-Z]/g) || []).length;
        if (lettersCount > 0 && (capsCount / lettersCount) > SPAM_CONFIG.maxCapsRatio) {
            return { isSpam: true, reason: 'Exceso de letras mayúsculas' };
        }
    }

    // Si pasa todos los filtros, actualizamos el historial de éxito para este usuario
    userHistory[user] = {
        lastTimestamp: now,
        lastMessage: cleanMsg
    };

    return { isSpam: false };
}

module.exports = {
    checkSpam,
    SPAM_CONFIG
};
