const WebSocket = require('ws');
const axios = require('axios');
const net = require('net');
const eventBus = require('./event-bus');
const configManager = require('./config-manager');
const { uiLog } = require('./logger');

let speakerbotActive = false;
let speakerbotWs = null;
let speakerbotCheckInterval = null;

function isSpeakerbotActive() {
    return speakerbotActive;
}

function updateStatus(active) {
    if (speakerbotActive !== active) {
        speakerbotActive = active;
        eventBus.emit('speakerbot_status', active);
    }
}

function initSpeakerbot() {
    // Limpiar WS anterior y el intervalo si existen
    if (speakerbotWs) {
        try {
            speakerbotWs.terminate();
        } catch (e) {}
        speakerbotWs = null;
    }

    if (speakerbotCheckInterval) {
        clearInterval(speakerbotCheckInterval);
        speakerbotCheckInterval = null;
    }

    const config = configManager.getConfig();

    if (config.SPEAKERBOT_URL.startsWith('ws://') || config.SPEAKERBOT_URL.startsWith('wss://')) {
        connectToSpeakerbotWs();
    } else {
        updateStatus(false);
        // Iniciar monitoreo HTTP
        speakerbotCheckInterval = setInterval(checkSpeakerBot, 4000);
        checkSpeakerBot(); // Verificación inicial
    }
}

function connectToSpeakerbotWs() {
    const config = configManager.getConfig();
    if (!config.SPEAKERBOT_URL.startsWith('ws://') && !config.SPEAKERBOT_URL.startsWith('wss://')) {
        return;
    }

    console.log(`🔌 Conectando al WebSocket de Speaker.bot en ${config.SPEAKERBOT_URL}...`);
    
    try {
        speakerbotWs = new WebSocket(config.SPEAKERBOT_URL);

        speakerbotWs.on('open', () => {
            console.log('✅ Conectado al WebSocket de Speaker.bot.');
            updateStatus(true);
            uiLog('Conectado al WebSocket de Speaker.bot (Puerto 7580)', 'system');
        });

        speakerbotWs.on('error', (err) => {
            console.error('❌ Error en WebSocket de Speaker.bot:', err.message);
        });

        speakerbotWs.on('close', () => {
            console.warn('⚠️ Conexión con Speaker.bot cerrada. Reconectando en 5s...');
            updateStatus(false);
            
            // Intentar reconectar si la URL sigue siendo WebSocket y no hemos destruido la referencia
            const currentConfig = configManager.getConfig();
            if (speakerbotWs && (currentConfig.SPEAKERBOT_URL.startsWith('ws://') || currentConfig.SPEAKERBOT_URL.startsWith('wss://'))) {
                setTimeout(() => {
                    const latestConfig = configManager.getConfig();
                    if (latestConfig.SPEAKERBOT_URL.startsWith('ws://') || latestConfig.SPEAKERBOT_URL.startsWith('wss://')) {
                        connectToSpeakerbotWs();
                    }
                }, 5000);
            }
        });
    } catch (err) {
        console.error('Error inicializando WebSocket de Speaker.bot:', err.message);
    }
}

async function checkSpeakerBot() {
    const config = configManager.getConfig();
    if (config.SPEAKERBOT_URL.startsWith('ws://') || config.SPEAKERBOT_URL.startsWith('wss://')) {
        return;
    }

    try {
        const url = new URL(config.SPEAKERBOT_URL);
        const host = url.hostname;
        const port = url.port || 7474;
        
        const socketCheck = new Promise((resolve, reject) => {
            const client = net.createConnection({ port, host, timeout: 1000 }, () => {
                client.end();
                resolve(true);
            });
            client.on('error', () => reject(false));
            client.on('timeout', () => {
                client.destroy();
                reject(false);
            });
        });

        const isOnline = await socketCheck;
        updateStatus(isOnline);
    } catch (e) {
        updateStatus(false);
    }
}

async function sendToSpeakerBot(text, user, voice) {
    const config = configManager.getConfig();
    const finalVoice = voice || config.VOICE_NAME;

    // Envío por WebSocket
    if (config.SPEAKERBOT_URL.startsWith('ws://') || config.SPEAKERBOT_URL.startsWith('wss://')) {
        if (speakerbotWs && speakerbotWs.readyState === WebSocket.OPEN) {
            try {
                const payload = {
                    request: "Speak",
                    id: `kick-tts-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                    voice: finalVoice,
                    message: text
                };
                speakerbotWs.send(JSON.stringify(payload));
                uiLog(`Enviado por WS a Speaker.bot con la voz "${finalVoice}"`, 'success');
            } catch (err) {
                uiLog(`Error enviando a Speaker.bot por WebSocket: ${err.message}`, 'error');
            }
        } else {
            uiLog(`Speaker.bot WebSocket desconectado. Revisa Speaker.bot en: ${config.SPEAKERBOT_URL}`, 'error');
        }
        return;
    }

    // Envío por HTTP
    try {
        await axios.post(config.SPEAKERBOT_URL, {
            message: text,
            voice: finalVoice
        });
        uiLog(`Enviado correctamente por HTTP a Speaker.bot con la voz "${finalVoice}"`, 'success');
        updateStatus(true);
    } catch (error) {
        uiLog(`Speaker.bot HTTP no respondió. Verifica que esté abierto en: ${config.SPEAKERBOT_URL}`, 'error');
        updateStatus(false);
    }
}

// Escuchar cambios de configuración para reinicializar
eventBus.on('config_updated', () => {
    initSpeakerbot();
});

module.exports = {
    initSpeakerbot,
    sendToSpeakerBot,
    isSpeakerbotActive
};
