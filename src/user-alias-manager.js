const fs = require('fs');
const path = require('path');
const eventBus = require('./event-bus');

const ALIAS_PATH = path.join(__dirname, '..', 'user-aliases.json');

let userAliases = {};

function loadUserAliases() {
    try {
        if (fs.existsSync(ALIAS_PATH)) {
            const fileData = fs.readFileSync(ALIAS_PATH, 'utf8');
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
        fs.writeFileSync(ALIAS_PATH, JSON.stringify(userAliases, null, 2), 'utf8');
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
        username: username, // guardar el casing original del username
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

// Cargar automáticamente al iniciar el módulo
loadUserAliases();

module.exports = {
    getUserAliases,
    getUserAlias,
    setUserAlias,
    deleteUserAlias
};
