const fs = require('fs');
const path = require('path');
const eventBus = require('./event-bus');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const BANNED_WORDS_PATH = path.join(__dirname, '..', 'banned-words.json');
const ALIASES_PATH = path.join(__dirname, '..', 'user-aliases.json');

let bannedWords = [];
let userAliases = {};

// ponytail: single source of truth is config.json on disk; these defaults only apply on first run
let config = {
    KICK_CHATROOM_ID: "4523166",
    PUSHER_KEY: "32cbd69e4b950bf97679",
    SPEAKERBOT_URL: "ws://127.0.0.1:7580/",
    VOICE_NAME: "Sabina",
    COMMAND: "!sp",
    VOICE_ALIASES: {
        "ava": "Ava",
        "brian": "Brian",
        "jorge": "Jorge",
        "sabina": "Sabina"
    },
    MAX_TEXT_LENGTH: 600
};

function loadBannedWords() {
    try {
        if (fs.existsSync(BANNED_WORDS_PATH)) {
            const fileData = fs.readFileSync(BANNED_WORDS_PATH, 'utf8');
            bannedWords = JSON.parse(fileData);
            console.log('✅ Palabras prohibidas cargadas desde banned-words.json');
        } else {
            bannedWords = ["cara de gato", "Caradegato", "puto", "puta", "maricon", "pendejo"];
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

function loadUserAliases() {
    try {
        if (fs.existsSync(ALIASES_PATH)) {
            const fileData = fs.readFileSync(ALIASES_PATH, 'utf8');
            userAliases = JSON.parse(fileData);
            console.log('✅ Aliases de usuarios cargados desde user-aliases.json');
        } else {
            userAliases = {};
            saveUserAliasesToFile();
        }
    } catch (e) {
        console.error('⚠️ Error al cargar user-aliases.json:', e.message);
        userAliases = {};
    }
}

function saveUserAliasesToFile() {
    try {
        fs.writeFileSync(ALIASES_PATH, JSON.stringify(userAliases, null, 2), 'utf8');
        console.log('💾 Aliases de usuarios guardados en user-aliases.json');
    } catch (e) {
        console.error('❌ Error escribiendo user-aliases.json:', e.message);
    }
}

function getUserAliases() {
    return userAliases;
}

function getUserAlias(username) {
    if (!username) return null;
    return userAliases[username.toLowerCase()] || null;
}

function setUserAlias(username, voiceName) {
    if (!username || !voiceName) return false;
    const key = username.toLowerCase();
    userAliases[key] = {
        username: username,
        voice: voiceName,
        updatedAt: new Date().toISOString()
    };
    saveUserAliasesToFile();
    eventBus.emit('user_aliases_updated', userAliases);
    return true;
}

function deleteUserAlias(username) {
    if (!username) return false;
    const key = username.toLowerCase();
    if (userAliases[key]) {
        delete userAliases[key];
        saveUserAliasesToFile();
        eventBus.emit('user_aliases_updated', userAliases);
        return true;
    }
    return false;
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
loadUserAliases();

module.exports = {
    getConfig,
    getBannedWords,
    updateConfig,
    containsBannedWords,
    getUserAliases,
    getUserAlias,
    setUserAlias,
    deleteUserAlias
};
