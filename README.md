# Kick-TTS

Bot de Texto-a-Voz para streams de [Kick.com](https://kick.com). Lee en voz alta los mensajes del chat usando **Speaker.bot** e incluye un panel de control web.

## Requisitos

- [Node.js](https://nodejs.org/) 16+
- [Speaker.bot](https://speaker.bot/) corriendo con WebSocket habilitado (puerto 7580 por defecto)

## Instalación

```bash
npm install
```

## Configuración

Edita `config.json` con los valores de tu sala:

| Campo | Descripción |
|---|---|
| `KICK_CHATROOM_ID` | ID de tu sala de Kick |
| `SPEAKERBOT_URL` | URL WebSocket de Speaker.bot |
| `VOICE_NAME` | Voz por defecto |
| `COMMAND` | Comando para activar TTS (ej: `!sp`) |
| `VOICE_ALIASES` | Mapeo de alias a voces disponibles |
| `MAX_TEXT_LENGTH` | Máximo de caracteres por mensaje |

## Uso

### Inicio rápido

```bash
node kick-tts.js
```

O usa `start.bat` en Windows.

Abre **http://localhost:3000** en tu navegador para ver el panel de control.

### Comandos en el chat

- `!sp <texto>` — reproduce el texto con tu voz asignada
- `!sp <voz> <texto>` — reproduce con una voz específica (solo ese mensaje)
- `!<voz>` — asigna una voz permanentemente a tu usuario (ej: `!sabina`, `!brian`, `!jorge`, `!ava`, `!andres`, `!grim`)
- `!bonk` — lanza un bonk simple
- `!bonks` — lanza una ráfaga de bonks

## Panel Web

http://localhost:3000

- **Pestaña Principal:** Comando TTS, voz por defecto, filtro de palabras prohibidas, iniciar/detener bot
- **Pestaña Voces Usuarios:** Usuarios con voz personalizada asignada
- **Pestaña Avanzado:** ID de chatroom, clave Pusher, URL de Speaker.bot, límite de caracteres

## Notas

- Las palabras prohibidas se gestionan desde el panel web
- Los alias de usuarios se guardan en `user-aliases.json` (no subir a GitHub)
- Si se cierran todas las conexiones del panel, el bot se apaga automáticamente
