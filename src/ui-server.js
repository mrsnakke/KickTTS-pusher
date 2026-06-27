const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const path = require('path');
const { exec } = require('child_process');
const eventBus = require('./event-bus');
const configManager = require('./config-manager');
const { isSpeakerbotActive } = require('./speakerbot');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
};

let wss = null;

function serveStatic(req, res) {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(PUBLIC_DIR, filePath);
    const ext = path.extname(filePath);
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
}

function broadcastToUI(data) {
    if (!wss) return;
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function getSystemStatus() {
    const kickClient = require('./kick-client');
    return {
        kickActive: kickClient.isKickActive(),
        kickConnected: kickClient.isKickConnected(),
        speakerbotActive: isSpeakerbotActive()
    };
}

function sendStatusUpdate() {
    broadcastToUI({ type: 'status_update', status: getSystemStatus() });
}

function initUiServer() {
    const server = http.createServer(serveStatic);
    wss = new WebSocket.Server({ server });

    eventBus.on('log', (logData) => { broadcastToUI(logData); });
    eventBus.on('kick_status', () => { sendStatusUpdate(); });
    eventBus.on('speakerbot_status', () => { sendStatusUpdate(); });
    eventBus.on('config_updated', ({ config, bannedWords }) => {
        broadcastToUI({ type: 'config', config, bannedWords });
    });
    eventBus.on('user_aliases_updated', (userAliases) => {
        broadcastToUI({ type: 'user_aliases', userAliases });
    });

    wss.on('connection', (ws) => {
        console.log('💻 Nueva conexión con la interfaz de usuario.');

        ws.send(JSON.stringify({ type: 'config', config: configManager.getConfig(), bannedWords: configManager.getBannedWords() }));
        ws.send(JSON.stringify({ type: 'user_aliases', userAliases: configManager.getUserAliases() }));
        ws.send(JSON.stringify({ type: 'status_update', status: getSystemStatus() }));

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'get_config') {
                    ws.send(JSON.stringify({ type: 'config', config: configManager.getConfig(), bannedWords: configManager.getBannedWords() }));
                } else if (data.type === 'save_config') {
                    configManager.updateConfig(data.config, data.bannedWords);
                } else if (data.type === 'delete_user_alias') {
                    configManager.deleteUserAlias(data.username);
                } else if (data.type === 'toggle_bot') {
                    eventBus.emit('toggle_bot_requested', { platform: data.platform, active: data.active });
                } else if (data.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'ping_pong', timestamp: data.timestamp }));
                }
            } catch (e) {
                console.error('Error parseando mensaje de UI:', e.message);
            }
        });

        ws.on('close', () => {
            console.log('💻 Interfaz de usuario desconectada.');
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

        if (process.platform === 'win32') {
            exec('start msedge --app=http://localhost:3000');
        } else if (process.platform === 'darwin') {
            exec('open -a "Google Chrome" --args --app=http://localhost:3000');
        } else {
            exec('google-chrome --app=http://localhost:3000');
        }
    });
}

module.exports = { initUiServer };
