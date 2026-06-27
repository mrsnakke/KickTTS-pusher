const WebSocket = require('ws');
const eventBus = require('./event-bus');
const configManager = require('./config-manager');
const { uiLog } = require('./logger');

let speakerbotActive = false;
let speakerbotWs = null;

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
    if (speakerbotWs) {
        try { speakerbotWs.terminate(); } catch (e) {}
        speakerbotWs = null;
    }
    connectToSpeakerbotWs();
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
            setTimeout(() => connectToSpeakerbotWs(), 5000);
        });
    } catch (err) {
        console.error('Error inicializando WebSocket de Speaker.bot:', err.message);
    }
}

function sendToSpeakerBot(text, user, voice) {
    const config = configManager.getConfig();
    const finalVoice = voice || config.VOICE_NAME;

    if (speakerbotWs && speakerbotWs.readyState === WebSocket.OPEN) {
        try {
            speakerbotWs.send(JSON.stringify({
                request: "Speak",
                id: `kick-tts-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                voice: finalVoice,
                message: text
            }));
            uiLog(`Enviado a Speaker.bot con la voz "${finalVoice}"`, 'success');
        } catch (err) {
            uiLog(`Error enviando a Speaker.bot: ${err.message}`, 'error');
        }
    } else {
        uiLog(`Speaker.bot desconectado. Revisa: ${config.SPEAKERBOT_URL}`, 'error');
    }
}

eventBus.on('config_updated', () => {
    initSpeakerbot();
});

module.exports = {
    initSpeakerbot,
    sendToSpeakerBot,
    isSpeakerbotActive
};
