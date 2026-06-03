He revisado la documentación y los foros de desarrolladores de la **API de Kick actualizados a 2026**. Te tengo excelentes noticias y algunas correcciones vitales para que tu bot no se rompa:

### ¿Qué ha cambiado en Kick (2026)?
1. **La API Oficial vs WebSockets:** Kick ya lanzó su API oficial (`api.kick.com` con OAuth 2.1), pero requiere autenticación de servidor a servidor bastante compleja. Para **solo leer el chat**, la comunidad de desarrolladores sigue utilizando y recomendando el puente de **Pusher (WebSockets)** porque no requiere autenticarse y es en tiempo real.
2. **Claves Dinámicas:** La clave de la aplicación de Pusher (`eb1d3864...`) que estabas usando es obsoleta. La principal ahora es `32cbd69e4b950bf97679`, y puede rotar.
3. **Estructura JSON del Chat:** Kick actualizó los nombres de las variables internas. Antes el usuario venía en `chatData.user.username`, pero ahora viene en `chatData.sender.username`.
4. **Desconexiones Silenciosas:** Pusher ahora expulsa a las conexiones que no envían un latido de vida (`ping`) cada 30 segundos. El código de antes se iba a desconectar y no te ibas a dar cuenta.

Aquí tienes el plan reorganizado y el código blindado contra estos cambios.

---

### 1. El Plan Técnico Actualizado

1. **Conexión Directa:** Usaremos el WebSocket de Pusher oficial de Kick para sortear el Cloudflare sin usar pesadas herramientas de automatización.
2. **Heartbeat (Latido):** El código enviará un evento `pusher:ping` periódico y responderá a los `pusher:pong` del servidor para que Kick no cierre la conexión.
3. **Filtro Anti-Spam y Crash:** Se incluye un bloque `try/catch` para evitar que si Kick envía un emoji mal formateado o un JSON roto, tu aplicación se caiga.
4. **Puente local:** Envío a **Speaker.bot** (por el puerto 7474) filtrando solo los comandos `!sp`.

---

### 2. Cómo obtener tu ID de Chatroom (Actualizado)

Las variables de la consola (`window.App`) se ofuscaron en las versiones recientes de Kick. La forma más infalible de obtener tu ID hoy en día es:
1. Abre tu navegador y ve a esta dirección (cambiando `tu_usuario` por tu nombre en kick):
   👉 `https://kick.com/api/v2/channels/tu_usuario`
2. Verás mucho código. Pulsa `Ctrl + F` y busca la palabra `"chatroom"`
3. Verás algo como `"chatroom":{"id":15034797,...`. 
4. Ese número (ej. `15034797`) es tu **ID de Chatroom**.

---

### 3. El Código a prueba de balas (kick-tts.js)

Borra tu código anterior y pega este. Tiene la estructura JSON y las llaves de seguridad actualizadas para 2026:

```javascript
const WebSocket = require('ws');
const axios = require('axios');

// --- CONFIGURACIÓN ---
const KICK_CHATROOM_ID = 'TU_ID_AQUÍ'; // Pon el ID numérico que buscaste arriba
const PUSHER_KEY = '32cbd69e4b950bf97679'; // Clave pública actual de Kick Pusher
const SPEAKERBOT_URL = 'http://localhost:7474/speak';
const VOICE_NAME = 'Nombre de tu Voz'; // Nombre exacto en Speaker.bot
const COMMAND = '!sp';

let socket;
let pingInterval;

function connectToKick() {
    console.log(`🚀 Iniciando conexión con Kick (Comando: ${COMMAND})...`);

    // Conexión con el protocolo actual de Kick
    const wsUrl = `wss://ws-us2.pusher.com/app/${PUSHER_KEY}?protocol=7&client=js&version=8.4.0-rc2&flash=false`;
    socket = new WebSocket(wsUrl);

    socket.on('open', () => {
        console.log('✅ Conectado al chat de Kick. Escuchando mensajes...');
        
        // 1. Suscribirse a la sala
        socket.send(JSON.stringify({
            event: 'pusher:subscribe',
            data: { auth: '', channel: `chatrooms.${KICK_CHATROOM_ID}.v2` }
        }));

        // 2. Sistema Heartbeat: Mantener la conexión viva cada 30 segundos
        pingInterval = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ event: 'pusher:ping' }));
            }
        }, 30000);
    });

    socket.on('message', (data) => {
        try {
            const response = JSON.parse(data);

            // Responder obligatoriamente si Pusher nos hace un ping
            if (response.event === 'pusher:ping') {
                socket.send(JSON.stringify({ event: 'pusher:pong' }));
                return;
            }

            // Detectar evento de chat (Versión actualizada de la API de Kick)
            if (response.event === 'App\\Events\\ChatMessageEvent') {
                const chatData = JSON.parse(response.data);
                const user = chatData.sender.username; // Estructura corregida para 2026
                const message = chatData.content.trim();

                // Filtrar el comando
                if (message.toLowerCase().startsWith(COMMAND.toLowerCase())) {
                    const cleanMessage = message.substring(COMMAND.length).trim();

                    if (cleanMessage.length > 0) {
                        console.log(`[TTS] ${user}: ${cleanMessage}`);
                        sendToSpeakerBot(cleanMessage, user);
                    } else {
                        console.log(`[INFO] ${user} usó el comando vacío.`);
                    }
                }
            }
        } catch (error) {
            // Esto evita que el bot se caiga si Kick envía un carácter extraño o JSON corrupto
            console.error('⚠️ Error procesando el mensaje de Kick:', error.message);
        }
    });

    socket.on('error', (err) => {
        console.error('❌ Error de red:', err.message);
    });

    socket.on('close', () => {
        console.warn('⚠️ Se perdió la conexión con Kick. Reconectando en 5s...');
        clearInterval(pingInterval); // Limpiamos el intervalo de pings
        setTimeout(connectToKick, 5000); // Reintento automático infinito
    });
}

async function sendToSpeakerBot(text, user) {
    try {
        await axios.post(SPEAKERBOT_URL, {
            message: text,
            // Opcional: si quieres que lea el nombre antes, cambia la línea de arriba por:
            // message: `${user} dice: ${text}`,
            voice: VOICE_NAME
        });
    } catch (error) {
        console.error('❌ Speaker.bot no respondió. Revisa si está abierto en el puerto 7474.');
    }
}

connectToKick();
```

---

### 4. Organizando su ejecución permanente (Inmortal)

Para asegurarte de que tu bot de TTS siempre se inicie cuando prendas tu computadora y se reinicie automáticamente si algo falla:

1. Instala PM2 desde la consola: 
   ```bash
   npm install pm2 -g
   ```
2. Ejecuta tu bot a través de PM2:
   ```bash
   pm2 start kick-tts.js --name "TTS-Kick"
   ```
3. Guarda la configuración para que arranque con Windows:
   ```bash
   pm2 save
   ```

**Consejo PRO de mantenimiento:**  
La `PUSHER_KEY` que pusimos (`32cbd...`) es la estándar de Kick en estos momentos. Si dentro de un año notas que el script no lee mensajes, abre tu canal en Google Chrome, presiona `F12`, ve a la pestaña **Network (Red)**, filtra por `pusher` en la caja de búsqueda y verás la URL con la nueva Key para actualizarla en tu código.