// Liberar el puerto 3000 antes de iniciar para evitar el error EADDRINUSE
const { execSync } = require('child_process');
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

// Cargar módulos del bot
const { initSpeakerbot } = require('./src/speakerbot');
const { initUiServer } = require('./src/ui-server');

// Inicializar conexión con Speaker.bot
initSpeakerbot();

// Inicializar Servidor de Interfaz de Usuario (Express y WebSocket local)
initUiServer();
