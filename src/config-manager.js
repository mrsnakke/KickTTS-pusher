const fs = require('fs');
const path = require('path');
const eventBus = require('./event-bus');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const BANNED_WORDS_PATH = path.join(__dirname, '..', 'banned-words.json');

let bannedWords = [];

// Default configuration
let config = {
    KICK_CHATROOM_ID: "4523166",
    SEVENTV_USER_ID: "01GJ7PS7DR000CQ2WDRACYQ5EH",
    SEVENTV_EMOTE_SET_ID: "01GJ7Q9840000CQ2WDRACYQ5FE", // Nuevo campo para Emote Set ID de 7TV
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

function getConfig() {
    return config;
}

function getBannedWords() {
    return bannedWords;
}

function updateConfig(newConfig, newBannedWords) {
    if (newConfig) {
        config = { ...config, ...newConfig };
        saveConfigToFile();
    }
    if (newBannedWords && Array.isArray(newBannedWords)) {
        bannedWords = newBannedWords;
        saveBannedWordsToFile();
    }
    // Emitir evento de configuración actualizada
    eventBus.emit('config_updated', { config, bannedWords });
}

function containsBannedWords(message) {
    const lowerMessage = message.toLowerCase();
    return bannedWords.some(word => {
        const cleanWord = word.trim().toLowerCase();
        if (!cleanWord) return false;
        return lowerMessage.includes(cleanWord);
    });
}

// Cargar automáticamente la configuración al iniciar
loadConfig();

module.exports = {
    getConfig,
    getBannedWords,
    updateConfig,
    containsBannedWords
};
