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
const { LiveChat } = require('youtube-chat');
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
            bannedWords = ["puto", "puta", "maricon", "pendejo", "mierda"];
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

// Función para parsear ID de canal o video de un enlace de YouTube
function parseYouTubeId(input) {
    if (!input) return "";
    input = input.trim();
    
    // Si contiene caracteres de URL de YouTube
    if (input.includes('youtube.com') || input.includes('youtu.be')) {
        try {
            // 1. Canal con ID específico: /channel/UC...
            const channelIdMatch = input.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/i);
            if (channelIdMatch) {
                return channelIdMatch[1];
            }
            
            // 2. Video / Live con watch?v=...
            if (input.includes('/watch')) {
                const urlParts = input.split('?')[1];
                if (urlParts) {
                    const params = new URLSearchParams(urlParts);
                    const v = params.get('v');
                    if (v) return v;
                }
            }
            
            // 3. Video / Live con /live/...
            const liveMatch = input.match(/\/live\/([a-zA-Z0-9_-]{11})/i);
            if (liveMatch) {
                return liveMatch[1];
            }
            
            // 4. Video corto con youtu.be/...
            const shortMatch = input.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
            if (shortMatch) {
                return shortMatch[1];
            }
        } catch (e) {
            console.error('⚠️ Error parseando URL de YouTube:', e.message);
        }
    }
    
    // Si no es URL o no coincide con los patrones, devolver tal cual
    return input;
}

// Cargar configuración inicial o crearla si no existe
let config = {
    KICK_CHATROOM_ID: "4523166",
    PUSHER_KEY: "32cbd69e4b950bf97679",
    YOUTUBE_CHANNEL_ID: "",
    SPEAKERBOT_URL: "ws://127.0.0.1:7580/",
    VOICE_NAME: "Grim",
    COMMAND: "!sp",
    VOICE_ALIASES: {
        "grim": "Grim",
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
let youtubeActive = false;
let kickWsConnected = false;
let ytConnected = false;
let speakerbotActive = false;
let kickSocket = null;
let kickPingInterval = null;
let speakerbotCheckInterval = null;
let speakerbotWs = null;
let youtubeChat = null;

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
                youtubeActive: youtubeActive,
                kickConnected: kickWsConnected,
                youtubeConnected: ytConnected,
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

                // Filtrar el comando
                if (message.toLowerCase().startsWith(config.COMMAND.toLowerCase())) {
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
                            // Truncar si supera el máximo configurado
                            if (config.MAX_TEXT_LENGTH && textToSpeak.length > config.MAX_TEXT_LENGTH) {
                                textToSpeak = textToSpeak.substring(0, config.MAX_TEXT_LENGTH) + '...';
                            }

                            // 1. Filtrar palabras prohibidas
                            if (containsBannedWords(textToSpeak)) {
                                uiLog(`Mensaje bloqueado: contiene palabras prohibidas`, 'error', user);
                                return;
                            }

                            // 2. Filtro anti-spam
                            const spamCheck = checkSpam(user, textToSpeak);
                            if (spamCheck.isSpam) {
                                uiLog(`Mensaje bloqueado por anti-spam: ${spamCheck.reason}`, 'error', user);
                                return;
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

// --- CONEXIÓN DE YOUTUBE LIVE CHAT ---
async function startYouTubeConnection() {
    if (!youtubeActive) return;

    if (!config.YOUTUBE_CHANNEL_ID) {
        uiLog('YouTube: ID de Canal o Enlace no configurado. Saltando conexión de YouTube.', 'info');
        return;
    }

    const parsedYoutubeId = parseYouTubeId(config.YOUTUBE_CHANNEL_ID);
    if (!parsedYoutubeId) {
        uiLog('YouTube: Enlace o ID de YouTube no es válido.', 'error');
        return;
    }

    uiLog(`YouTube: Conectando al chat de YouTube para el canal/video: ${parsedYoutubeId}...`, 'system');

    try {
        const options = {};
        if (parsedYoutubeId.startsWith('UC')) {
            options.channelId = parsedYoutubeId;
        } else {
            options.liveId = parsedYoutubeId;
        }

        youtubeChat = new LiveChat(options);

        youtubeChat.on('start', (liveId) => {
            ytConnected = true;
            uiLog(`YouTube: Conectado con éxito al chat del stream. (Video ID: ${liveId})`, 'system');
            sendStatusUpdate();
        });

        youtubeChat.on('chat', (chatItem) => {
            try {
                const user = chatItem.author.name;
                let message = "";
                if (chatItem.message) {
                    message = chatItem.message.map(m => m.text || "").join("").trim();
                }

                if (!message) return;

                // Filtrar el comando
                if (message.toLowerCase().startsWith(config.COMMAND.toLowerCase())) {
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
                            console.log(`[ALIAS-YT] Detectado alias "${lowerFirstWord}" -> usando voz "${finalVoice}"`);
                        }

                        if (textToSpeak.length > 0) {
                            // 1. Filtrar palabras prohibidas
                            if (containsBannedWords(textToSpeak)) {
                                uiLog(`Mensaje bloqueado: contiene palabras prohibidas`, 'error', user);
                                return;
                            }

                            // 2. Filtro anti-spam
                            const spamCheck = checkSpam(user, textToSpeak);
                            if (spamCheck.isSpam) {
                                uiLog(`Mensaje bloqueado por anti-spam: ${spamCheck.reason}`, 'error', user);
                                return;
                            }

                            uiLog(textToSpeak, 'chat_tts_youtube', user);
                            sendToSpeakerBot(textToSpeak, user, finalVoice);
                        } else {
                            uiLog('Mensaje vacío ignorado tras remover el alias de voz.', 'info', user);
                        }
                    } else {
                        uiLog('Mensaje vacío ignorado.', 'info', user);
                    }
                } else {
                    // Loguear mensajes ordinarios sin reproducirlos
                    uiLog(message, 'chat_message_youtube', user);
                }
            } catch (err) {
                console.error('Error procesando chat de YouTube:', err);
            }
        });

        youtubeChat.on('error', (err) => {
            uiLog(`YouTube Error: ${err.message || err}`, 'error');
        });

        const started = await youtubeChat.start();
        if (!started) {
            uiLog('YouTube: No se pudo conectar al chat en vivo. Revisa si el canal está en transmisión directa.', 'error');
        }
    } catch (err) {
        uiLog(`YouTube: Error al inicializar: ${err.message || err}`, 'error');
    }
}

function stopYouTubeConnection() {
    ytConnected = false;
    sendStatusUpdate();

    if (youtubeChat) {
        try {
            youtubeChat.stop();
        } catch(e){}
        youtubeChat = null;
    }
}

async function sendToSpeakerBot(text, user, voice = config.VOICE_NAME) {
    // Si la URL es de WebSocket
    if (config.SPEAKERBOT_URL.startsWith('ws://') || config.SPEAKERBOT_URL.startsWith('wss://')) {
        if (speakerbotWs && speakerbotWs.readyState === WebSocket.OPEN) {
            try {
                const payload = {
                    request: "Speak",
                    id: `kick-tts-${Date.now()}`,
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
        status: { kickActive, youtubeActive, kickConnected: kickWsConnected, youtubeConnected: ytConnected, speakerbotActive }
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

                initSpeakerbot(); // Reconectar Speaker.bot si cambió la URL
                broadcastToUI({ type: 'config', config, bannedWords });
                uiLog('Configuración actualizada por el usuario.', 'system');

                // Reiniciar Kick si estaba activo
                if (kickActive) {
                    uiLog("Reiniciando conexión con Kick para aplicar la nueva configuración...", "system");
                    stopKickConnection();
                    startKickConnection();
                }
                // Reiniciar YouTube si estaba activo
                if (youtubeActive) {
                    uiLog("Reiniciando conexión con YouTube para aplicar la nueva configuración...", "system");
                    stopYouTubeConnection();
                    startYouTubeConnection();
                }
            }
            else if (data.type === 'toggle_bot') {
                const platform = data.platform; // 'kick' o 'youtube'
                const active = data.active;

                if (platform === 'kick') {
                    kickActive = active;
                    if (active) {
                        startKickConnection();
                    } else {
                        stopKickConnection();
                    }
                } else if (platform === 'youtube') {
                    youtubeActive = active;
                    if (active) {
                        startYouTubeConnection();
                    } else {
                        stopYouTubeConnection();
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
