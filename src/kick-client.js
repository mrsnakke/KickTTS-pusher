const WebSocket = require('ws');
const eventBus = require('./event-bus');
const configManager = require('./config-manager');
const { checkSpam } = require('./spam-filter');
const { uiLog } = require('./logger');
const { sendToSpeakerBot } = require('./speakerbot');

let kickActive = false;
let kickWsConnected = false;
let kickSocket = null;
let kickPingInterval = null;

function isKickActive() {
    return kickActive;
}

function isKickConnected() {
    return kickWsConnected;
}

function updateStatus(connected) {
    if (kickWsConnected !== connected) {
        kickWsConnected = connected;
        emitStatusUpdate();
    }
}

function setKickActive(active) {
    if (kickActive !== active) {
        kickActive = active;
        emitStatusUpdate();
        if (active) {
            startKickConnection();
        } else {
            stopKickConnection();
        }
    }
}

function emitStatusUpdate() {
    eventBus.emit('kick_status', { kickActive, kickConnected: kickWsConnected });
}

function startKickConnection() {
    if (!kickActive) return;

    const config = configManager.getConfig();

    if (!config.KICK_CHATROOM_ID) {
        uiLog('No se puede conectar a Kick: ID de Chatroom vacío.', 'error');
        return;
    }

    uiLog(`Iniciando conexión con el WebSocket de Kick para la sala: ${config.KICK_CHATROOM_ID}...`, 'system');

    const wsUrl = `wss://ws-us2.pusher.com/app/${config.PUSHER_KEY}?protocol=7&client=js&version=8.4.0-rc2&flash=false`;
    kickSocket = new WebSocket(wsUrl);

    kickSocket.on('open', () => {
        updateStatus(true);
        uiLog(`Conectado al chat de Kick. Suscribiéndose al canal de chatroom...`, 'system');

        // 1. Suscribirse a la sala
        kickSocket.send(JSON.stringify({
            event: 'pusher:subscribe',
            data: { auth: '', channel: `chatrooms.${config.KICK_CHATROOM_ID}.v2` }
        }));

        // 2. Sistema Heartbeat: Mantener la conexión viva cada 30 segundos
        if (kickPingInterval) clearInterval(kickPingInterval);
        kickPingInterval = setInterval(() => {
            if (kickSocket && kickSocket.readyState === WebSocket.OPEN) {
                kickSocket.send(JSON.stringify({ event: 'pusher:ping' }));
            }
        }, 30000);
    });

    kickSocket.on('message', (data) => {
        try {
            const response = JSON.parse(data);

            // Responder obligatoriamente si Pusher nos hace un ping
            if (response.event === 'pusher:ping') {
                if (kickSocket && kickSocket.readyState === WebSocket.OPEN) {
                    kickSocket.send(JSON.stringify({ event: 'pusher:pong' }));
                }
                return;
            }

            // Detectar evento de chat (Versión de la API de Kick 2026)
            if (response.event === 'App\\Events\\ChatMessageEvent') {
                const chatData = JSON.parse(response.data);
                const user = chatData.sender.username;
                const message = chatData.content.trim();
                const msgType = chatData.type || 'message';

                // Determinar si es un canje de recompensa (reward redemption)
                const isRewardRedemption = 
                    msgType === 'reward_redemption' || 
                    msgType === 'channel_points' ||
                    (msgType === 'action' && (
                        message.startsWith('canjeó ') || 
                        message.includes('canjeó') || 
                        message.startsWith('has redeemed ') || 
                        message.includes('has redeemed')
                    )) ||
                    (chatData.metadata && (chatData.metadata.type === 'reward_redemption' || chatData.metadata.reward));

                if (isRewardRedemption) {
                    let rewardName = message;
                    if (message.startsWith('canjeó ')) {
                        rewardName = message.substring('canjeó '.length).trim();
                    } else if (message.startsWith('has redeemed ')) {
                        rewardName = message.substring('has redeemed '.length).trim();
                    } else if (chatData.metadata && chatData.metadata.reward && chatData.metadata.reward.title) {
                        rewardName = chatData.metadata.reward.title;
                    }
                    
                    // Loguear el canje en el monitor de la app
                    uiLog(rewardName, 'chat_reward_redemption_kick', user);
                }
                // Detectar comando de cambio de alias personal (ej: !sabina o !grim)
                else if (message.startsWith('!') && !message.toLowerCase().startsWith(configManager.getConfig().COMMAND.toLowerCase())) {
                    const potentialVoiceKey = message.substring(1).trim().toLowerCase();
                    const aliases = configManager.getConfig().VOICE_ALIASES;
                    if (aliases && aliases[potentialVoiceKey]) {
                        const assignedVoice = aliases[potentialVoiceKey];
                        const userAliasManager = require('./user-alias-manager');
                        userAliasManager.setUserAlias(user, assignedVoice);
                        uiLog(`Asignada voz "${assignedVoice}" al usuario ${user} mediante comando "${message}".`, 'system', user);
                    } else {
                        // Es un comando que empieza con ! pero no es un alias válido, lo logueamos como mensaje ordinario
                        uiLog(message, 'chat_message_kick', user);
                    }
                }
                // Filtrar el comando principal de TTS
                else if (message.toLowerCase().startsWith(configManager.getConfig().COMMAND.toLowerCase())) {
                    const cleanMessage = message.substring(configManager.getConfig().COMMAND.length).trim();

                    if (cleanMessage.length > 0) {
                        // Comprobar SPAM si el filtro de spam está activado
                        const spamResult = checkSpam(user, cleanMessage);
                        if (spamResult.isSpam) {
                            uiLog(`Mensaje bloqueado por SPAM: ${spamResult.reason}`, 'error', user);
                            return;
                        }

                        // Resolver Alias de Voces si aplica
                        let finalVoice = configManager.getConfig().VOICE_NAME;
                        let textToSpeak = cleanMessage;

                        // Extraer primera palabra (posible alias temporal)
                        const firstWord = cleanMessage.split(/\s+/)[0];
                        const lowerFirstWord = firstWord.toLowerCase();
                        const aliases = configManager.getConfig().VOICE_ALIASES;
                        let usedTemporalAlias = false;

                        if (aliases && aliases[lowerFirstWord]) {
                            finalVoice = aliases[lowerFirstWord];
                            // Remover el alias de la cadena de texto para hablar
                            textToSpeak = cleanMessage.substring(firstWord.length).trim();
                            usedTemporalAlias = true;
                            console.log(`[ALIAS-KICK] Detectado alias temporal "${lowerFirstWord}" -> usando voz "${finalVoice}"`);
                        }

                        // Si no se especificó un alias temporal en el mensaje, buscar si el usuario tiene un alias personal guardado
                        if (!usedTemporalAlias) {
                            const userAliasManager = require('./user-alias-manager');
                            const personalAlias = userAliasManager.getUserAlias(user);
                            if (personalAlias) {
                                finalVoice = personalAlias.voice;
                                console.log(`[ALIAS-KICK] Detectado alias personal para "${user}" -> usando voz "${finalVoice}"`);
                            }
                        }

                        if (textToSpeak.length > 0) {
                            // Comprobar palabras prohibidas
                            if (configManager.containsBannedWords(textToSpeak)) {
                                uiLog(`Mensaje bloqueado por contener palabras prohibidas.`, 'error', user);
                                return;
                            }

                            // Truncar si supera el máximo configurado
                            const maxLen = configManager.getConfig().MAX_TEXT_LENGTH;
                            if (maxLen && textToSpeak.length > maxLen) {
                                textToSpeak = textToSpeak.substring(0, maxLen) + '...';
                            }

                            uiLog(textToSpeak, 'chat_tts_kick', user);
                            sendToSpeakerBot(textToSpeak, user, finalVoice);
                        } else {
                            uiLog('Mensaje vacío ignorado tras remover el alias de voz.', 'info', user);
                        }
                    } else {
                        uiLog('Mensaje vacío ignorado.', 'info', user);
                    }
                } else {
                    // Loguear mensajes ordinarios sin reproducirlos
                    uiLog(message, 'chat_message_kick', user);
                }
            }
        } catch (error) {
            uiLog(`Error procesando mensaje de Kick: ${error.message}`, 'error');
        }
    });

    kickSocket.on('error', (err) => {
        uiLog(`Error de WebSocket de Kick: ${err.message}`, 'error');
    });

    kickSocket.on('close', () => {
        updateStatus(false);
        clearInterval(kickPingInterval);

        if (kickActive) {
            uiLog('Se perdió la conexión con Kick. Reconectando en 5 segundos...', 'error');
            setTimeout(startKickConnection, 5000);
        } else {
            uiLog('Conexión con Kick cerrada de manera limpia.', 'system');
        }
    });
}

function stopKickConnection() {
    updateStatus(false);

    if (kickPingInterval) {
        clearInterval(kickPingInterval);
        kickPingInterval = null;
    }

    if (kickSocket) {
        kickSocket.close();
        kickSocket = null;
    }
}

// Reaccionar a cambios de configuración
eventBus.on('config_updated', () => {
    if (kickActive) {
        uiLog("Reiniciando conexión con Kick para aplicar la nueva configuración...", "system");
        stopKickConnection();
        startKickConnection();
    }
});

// Reaccionar a señales de activación/desactivación de la UI
eventBus.on('toggle_bot_requested', ({ platform, active }) => {
    if (platform === 'kick') {
        setKickActive(active);
    }
});

module.exports = {
    startKickConnection,
    stopKickConnection,
    isKickActive,
    isKickConnected,
    setKickActive
};
