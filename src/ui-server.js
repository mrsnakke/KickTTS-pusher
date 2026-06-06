const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { exec } = require('child_process');
const eventBus = require('./event-bus');
const configManager = require('./config-manager');
const { isSpeakerbotActive } = require('./speakerbot');
const userAliasManager = require('./user-alias-manager');

const PORT = 3000;

let serverInstance = null;
let wss = null;

// Enviar datos a todos los frontends conectados
function broadcastToUI(data) {
    if (!wss) return;
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function getSystemStatus() {
    // Requerir de forma dinámica para evitar dependencias circulares
    const kickClient = require('./kick-client');
    return {
        kickActive: kickClient.isKickActive(),
        kickConnected: kickClient.isKickConnected(),
        speakerbotActive: isSpeakerbotActive()
    };
}

function sendStatusUpdate() {
    broadcastToUI({
        type: 'status_update',
        status: getSystemStatus()
    });
}

function initUiServer() {
    const app = express();
    const server = http.createServer(app);
    wss = new WebSocket.Server({ server });

    app.use(express.static(path.join(__dirname, '..', 'public')));
    app.use(express.json());

    // Listeners del bus de eventos para retransmitir cambios a la UI
    eventBus.on('log', (logData) => {
        broadcastToUI(logData);
    });

    eventBus.on('kick_status', () => {
        sendStatusUpdate();
    });

    eventBus.on('speakerbot_status', () => {
        sendStatusUpdate();
    });

    eventBus.on('config_updated', ({ config, bannedWords }) => {
        broadcastToUI({ type: 'config', config, bannedWords });
    });

    eventBus.on('user_aliases_updated', (userAliases) => {
        broadcastToUI({ type: 'user_aliases', userAliases });
    });

    wss.on('connection', (ws) => {
        console.log('💻 Nueva conexión con la interfaz de usuario.');

        // Enviar configuración y estados iniciales al conectar
        ws.send(JSON.stringify({
            type: 'config',
            config: configManager.getConfig(),
            bannedWords: configManager.getBannedWords()
        }));

        ws.send(JSON.stringify({
            type: 'user_aliases',
            userAliases: userAliasManager.getUserAliases()
        }));

        ws.send(JSON.stringify({
            type: 'status_update',
            status: getSystemStatus()
        }));

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                if (data.type === 'get_config') {
                    ws.send(JSON.stringify({
                        type: 'config',
                        config: configManager.getConfig(),
                        bannedWords: configManager.getBannedWords()
                    }));
                }
                else if (data.type === 'save_config') {
                    configManager.updateConfig(data.config, data.bannedWords);
                }
                else if (data.type === 'delete_user_alias') {
                    userAliasManager.deleteUserAlias(data.username);
                }
                else if (data.type === 'toggle_bot') {
                    eventBus.emit('toggle_bot_requested', {
                        platform: data.platform, // 'kick'
                        active: data.active
                    });
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

    serverInstance = server;
}

module.exports = {
    initUiServer
};
