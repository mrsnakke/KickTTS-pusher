// Liberar el puerto 3000 antes de iniciar para evitar el error EADDRINUSE
const { exec, execSync } = require('child_process');
try {
    if (process.platform === 'win32') {
        // En Windows, buscamos el PID que usa el puerto 3000 y lo matamos
        execSync('cmd /c "for /f \\"tokens=5\\" %a in (\'netstat -aon ^| findstr :3000\') do taskkill /f /pid %a"', { stdio: 'ignore' });
    } else {
        // En Linux/macOS, matamos el proceso del puerto 3000
        execSync('lsof -t -i:3000 | xargs kill -9', { stdio: 'ignore' });
    }
    console.log('⚡ Puerto 3000 liberado con éxito.');
} catch (e) {
    // No había ningún proceso escuchando o ya estaba libre
}

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { checkSpam } = require('./spam-filter');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const BANNED_WORDS_PATH = path.join(__dirname, 'banned-words.json');
const PORT = 3000;

let bannedWords = [];

function loadBannedWords() {
    try {
        if (fs.existsSync(BANNED_WORDS_PATH)) {
            const fileData = fs.readFileSync(BANNED_WORDS_PATH, 'utf8');
            bannedWords = JSON.parse(fileData);
            console.log('✅ Palabras prohibidas cargadas desde banned-words.json');
        } else {
            bannedWords = ["puto", "puta", "maricon", "pendejo"];
            saveBannedWordsToFile();
        }
    } catch (e) {
        console.error('⚠️ Error al cargar banned-words.json:', e.message);
    }
}

function saveBannedWordsToFile() {
    try {
        fs.writeFileSync(BANNED_WORDS_PATH, JSON.stringify(bannedWords, null, 2), 'utf8');
        console.log('💾 Palabras prohibidas guardadas en banned-words.json');
    } catch (e) {
        console.error('❌ Error escribiendo banned-words.json:', e.message);
    }
}

function containsBannedWords(message) {
    const lowerMessage = message.toLowerCase();
    return bannedWords.some(word => {
        const cleanWord = word.trim().toLowerCase();
        if (!cleanWord) return false;
        return lowerMessage.includes(cleanWord);
    });
}

// Cargar configuración inicial o crearla si no existe
let config = {
    KICK_CHATROOM_ID: "4523166",
    PUSHER_KEY: "32cbd69e4b950bf97679",
    SPEAKERBOT_URL: "ws://127.0.0.1:7580/",
    VOICE_NAME: "Grim",
    COMMAND: "!sp",
    VOICE_ALIASES: {
        "andrés": "Andrés",
        "andres": "Andrés",
        "ava": "Ava",
        "brian": "Brian",
        "grim": "Grim",
        "jorge": "Jorge",
        "sabina": "Sabina"
    },
    MAX_TEXT_LENGTH: 200
};

function loadConfig() {
    try {
        loadBannedWords();
        if (fs.existsSync(CONFIG_PATH)) {
            const fileData = fs.readFileSync(CONFIG_PATH, 'utf8');
            config = { ...config, ...JSON.parse(fileData) };
            console.log('✅ Configuración cargada desde config.json');
        } else {
            saveConfigToFile();
        }
        initSpeakerbot();
    } catch (e) {
        console.error('⚠️ Error al cargar config.json, usando valores por defecto:', e.message);
    }
}

function saveConfigToFile() {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
        console.log('💾 Configuración guardada en config.json');
    } catch (e) {
        console.error('❌ Error escribiendo config.json:', e.message);
    }
}

// Variables de estado del bot
let kickActive = false;
let kickWsConnected = false;
let speakerbotActive = false;
let kickSocket = null;
let kickPingInterval = null;
let speakerbotCheckInterval = null;
let speakerbotWs = null;

// Servidor Express y WS local para la interfaz gráfica
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Servir la carpeta public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Broadcast de datos a todos los clientes del frontend conectados
function broadcastToUI(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Enviar logs de consola al frontend
function uiLog(message, logType = 'info', user = null) {
    console.log(`[${logType.toUpperCase()}] ${user ? user + ': ' : ''}${message}`);
    broadcastToUI({
        type: 'log',
        logType,
        message,
        user
    });
}

// Enviar el estado actualizado de las conexiones al frontend
function sendStatusUpdate() {
    broadcastToUI({
            type: 'status_update',
            status: {
                kickActive: kickActive,
                kickConnected: kickWsConnected,
                speakerbotActive
            }
    });
}

// --- GESTIÓN DE SPEAKER.BOT (SOPORTA HTTP Y WEBSOCKETS) ---
function initSpeakerbot() {
    // Limpiar WS anterior si existe
    if (speakerbotWs) {
        try {
            speakerbotWs.terminate();
        } catch(e){}
        speakerbotWs = null;
    }

    if (config.SPEAKERBOT_URL.startsWith('ws://') || config.SPEAKERBOT_URL.startsWith('wss://')) {
        connectToSpeakerbotWs();
    } else {
        speakerbotActive = false;
        sendStatusUpdate();
    }
}

function connectToSpeakerbotWs() {
    if (!config.SPEAKERBOT_URL.startsWith('ws://') && !config.SPEAKERBOT_URL.startsWith('wss://')) {
        return;
    }

    console.log(`🔌 Conectando al WebSocket de Speaker.bot en ${config.SPEAKERBOT_URL}...`);
    
    try {
        speakerbotWs = new WebSocket(config.SPEAKERBOT_URL);

        speakerbotWs.on('open', () => {
            console.log('✅ Conectado al WebSocket de Speaker.bot.');
            speakerbotActive = true;
            sendStatusUpdate();
            uiLog('Conectado al WebSocket de Speaker.bot (Puerto 7580)', 'system');
        });

        speakerbotWs.on('error', (err) => {
            console.error('❌ Error en WebSocket de Speaker.bot:', err.message);
        });

        speakerbotWs.on('close', () => {
            console.warn('⚠️ Conexión con Speaker.bot cerrada. Reconectando en 5s...');
            speakerbotActive = false;
            sendStatusUpdate();
            
            // Reconectar si la URL sigue siendo WebSocket y no se ha creado otro socket
            if (speakerbotWs && (config.SPEAKERBOT_URL.startsWith('ws://') || config.SPEAKERBOT_URL.startsWith('wss://'))) {
                setTimeout(() => {
                    if (config.SPEAKERBOT_URL.startsWith('ws://') || config.SPEAKERBOT_URL.startsWith('wss://')) {
                        connectToSpeakerbotWs();
                    }
                }, 5000);
            }
        });
    } catch (err) {
        console.error('Error inicializando WebSocket de Speaker.bot:', err.message);
    }
}

// Verificar periódicamente si Speaker.bot HTTP está en línea
async function checkSpeakerBot() {
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
        if (isOnline !== speakerbotActive) {
            speakerbotActive = isOnline;
            sendStatusUpdate();
        }
    } catch (e) {
        if (speakerbotActive !== false) {
            speakerbotActive = false;
            sendStatusUpdate();
        }
    }
}

// Iniciar monitoreo de Speaker.bot HTTP cada 4 segundos
speakerbotCheckInterval = setInterval(checkSpeakerBot, 4000);

loadConfig();

// --- CONEXIÓN DE WEBSOCKET KICK ---
function startKickConnection() {
    if (!kickActive) return;

    if (!config.KICK_CHATROOM_ID) {
        uiLog('No se puede conectar a Kick: ID de Chatroom vacío.', 'error');
        return;
    }

    uiLog(`Iniciando conexión con el WebSocket de Kick para la sala: ${config.KICK_CHATROOM_ID}...`, 'system');

    const wsUrl = `wss://ws-us2.pusher.com/app/${config.PUSHER_KEY}?protocol=7&client=js&version=8.4.0-rc2&flash=false`;
    kickSocket = new WebSocket(wsUrl);

    kickSocket.on('open', () => {
        kickWsConnected = true;
        uiLog(`Conectado al chat de Kick. Suscribiéndose al canal de chatroom...`, 'system');
        sendStatusUpdate();

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
                // Filtrar el comando
                else if (message.toLowerCase().startsWith(config.COMMAND.toLowerCase())) {
                    const cleanMessage = message.substring(config.COMMAND.length).trim();

                    if (cleanMessage.length > 0) {
                        // Resolver Alias de Voces si aplica
                        let finalVoice = config.VOICE_NAME;
                        let textToSpeak = cleanMessage;

                        // Extraer primera palabra (posible alias)
                        const firstWord = cleanMessage.split(/\s+/)[0];
                        const lowerFirstWord = firstWord.toLowerCase();

                        if (config.VOICE_ALIASES && config.VOICE_ALIASES[lowerFirstWord]) {
                            finalVoice = config.VOICE_ALIASES[lowerFirstWord];
                            // Remover el alias de la cadena de texto para hablar
                            textToSpeak = cleanMessage.substring(firstWord.length).trim();
                            console.log(`[ALIAS-KICK] Detectado alias "${lowerFirstWord}" -> usando voz "${finalVoice}"`);
                        }

                        if (textToSpeak.length > 0) {
                            // Comprobar palabras prohibidas
                            if (containsBannedWords(textToSpeak)) {
                                uiLog(`Mensaje bloqueado por contener palabras prohibidas.`, 'error', user);
                                return;
                            }

                            // Truncar si supera el máximo configurado
                            if (config.MAX_TEXT_LENGTH && textToSpeak.length > config.MAX_TEXT_LENGTH) {
                                textToSpeak = textToSpeak.substring(0, config.MAX_TEXT_LENGTH) + '...';
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
        kickWsConnected = false;
        sendStatusUpdate();
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
    kickWsConnected = false;
    sendStatusUpdate();

    if (kickPingInterval) {
        clearInterval(kickPingInterval);
        kickPingInterval = null;
    }

    if (kickSocket) {
        kickSocket.close();
        kickSocket = null;
    }
}

async function sendToSpeakerBot(text, user, voice = config.VOICE_NAME) {
    // Si la URL es de WebSocket
    if (config.SPEAKERBOT_URL.startsWith('ws://') || config.SPEAKERBOT_URL.startsWith('wss://')) {
        if (speakerbotWs && speakerbotWs.readyState === WebSocket.OPEN) {
            try {
                const payload = {
                    request: "Speak",
                    id: `kick-tts-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                    voice: voice,
                    message: text
                };
                speakerbotWs.send(JSON.stringify(payload));
                uiLog(`Enviado por WS a Speaker.bot con la voz "${voice}"`, 'success');
            } catch (err) {
                uiLog(`Error enviando a Speaker.bot por WebSocket: ${err.message}`, 'error');
            }
        } else {
            uiLog(`Speaker.bot WebSocket desconectado. Revisa Speaker.bot en: ${config.SPEAKERBOT_URL}`, 'error');
        }
        return;
    }

    // Si la URL es HTTP
    try {
        await axios.post(config.SPEAKERBOT_URL, {
            message: text,
            voice: voice
        });
        uiLog(`Enviado correctamente por HTTP a Speaker.bot con la voz "${voice}"`, 'success');
        if (!speakerbotActive) {
            speakerbotActive = true;
            sendStatusUpdate();
        }
    } catch (error) {
        uiLog(`Speaker.bot HTTP no respondió. Verifica que esté abierto en: ${config.SPEAKERBOT_URL}`, 'error');
        if (speakerbotActive) {
            speakerbotActive = false;
            sendStatusUpdate();
        }
    }
}

// --- GESTIÓN DE CLIENTES DE INTERFAZ GRÁFICA (WEBSOCKET LOCAL) ---
wss.on('connection', (ws) => {
    console.log('💻 Nueva conexión con la interfaz de usuario.');
    
    ws.send(JSON.stringify({ type: 'config', config, bannedWords }));
    ws.send(JSON.stringify({
        type: 'status_update',
        status: { kickActive, kickConnected: kickWsConnected, speakerbotActive }
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'get_config') {
                ws.send(JSON.stringify({ type: 'config', config, bannedWords }));
            }
            else if (data.type === 'save_config') {
                config = { ...config, ...data.config };
                saveConfigToFile();

                if (data.bannedWords && Array.isArray(data.bannedWords)) {
                    bannedWords = data.bannedWords;
                    saveBannedWordsToFile();
                }

                broadcastToUI({ type: 'config', config, bannedWords });
                uiLog('Configuración actualizada por el usuario.', 'system');

                // Reiniciar Kick si estaba activo
                if (kickActive) {
                    uiLog("Reiniciando conexión con Kick para aplicar la nueva configuración...", "system");
                    stopKickConnection();
                    // Solo reconectar Speaker.bot si cambió la URL, Kick no debería afectarlo directamente.
                    initSpeakerbot(); 
                    startKickConnection();
                } else {
                    // Si Kick no estaba activo, solo reconectar Speaker.bot si cambió la URL
                    initSpeakerbot();
                }
            }
            else if (data.type === 'toggle_bot') {
                const platform = data.platform; // 'kick'
                const active = data.active;

                if (platform === 'kick') {
                    kickActive = active;
                    if (active) {
                        startKickConnection();
                    } else {
                        stopKickConnection();
                    }
                }
                sendStatusUpdate();
            }
            else if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'ping_pong', timestamp: data.timestamp }));
            }
        } catch (e) {
            console.error('Error parseando mensaje de UI:', e.message);
        }
    });

    ws.on('close', () => {
        console.log('💻 Interfaz de usuario desconectada.');
        
        // Tiempo de gracia de 5 segundos para recargas o recambios de pestaña.
        // Si no se reconecta ninguna interfaz, el bot en segundo plano se apaga solo de forma limpia.
        setTimeout(() => {
            if (wss.clients.size === 0) {
                console.log('🔌 No hay interfaces de usuario conectadas. Apagando bot silencioso...');
                process.exit(0);
            }
        }, 5000);
    });
});

// Iniciar servidor local
server.listen(PORT, () => {
    console.log('\n======================================================');
    console.log(`🎉 ¡Kick TTS Dashboard levantado con Éxito!`);
    console.log(`👉 Abre en tu navegador: http://localhost:${PORT}`);
    console.log('======================================================\n');

    // Lanzar automáticamente la ventana independiente de la aplicación (App Mode) en Microsoft Edge o Google Chrome
    if (process.platform === 'win32') {
        exec('start msedge --app=http://localhost:3000');
    } else if (process.platform === 'darwin') {
        exec('open -a "Google Chrome" --args --app=http://localhost:3000');
    } else {
        exec('google-chrome --app=http://localhost:3000');
    }
});
