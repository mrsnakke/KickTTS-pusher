# 🎙️ Kick & YouTube TTS - ¡Tu Chat Hablado para Streamers! 🚀

¡Hola Streamer! Con esta aplicación podrás hacer que los mensajes de tus chats de **Kick** y **YouTube** se escuchen en vivo en tu transmisión usando **Speaker.bot**. 

Viene con una **consola visual muy intuitiva (modo oscuro)** para que no tengas que configurar nada editando archivos raros de código. ¡Todo se controla con clics!

---

## 🛠️ ¿Qué necesitas para empezar? (Requisitos)

Solo necesitas 2 cosas instaladas en tu computadora:

1. **Speaker.bot** (El programa que genera las voces):
   - Descárgalo e inícialo. Asegúrate de tener al menos una voz configurada y el servidor activado (por defecto usa el puerto `7474` o `7580`).
2. **Node.js** (El motor que hace funcionar este bot):
   - Descárgalo gratis e instálalo desde [nodejs.org](https://nodejs.org/) (elige la versión recomendada **LTS**).

---

## 🚀 Cómo Iniciar el Bot (Paso a Paso)

¡Es súper fácil! Sigue estos pasos:

1. **Instalar los componentes necesarios (Solo se hace la primera vez):**
   - Haz doble clic en el archivo llamado `start.bat` que viene en la carpeta del proyecto.
   - Si es la primera vez, el programa detectará que faltan paquetes y los instalará automáticamente.
2. **¡Listo para usar!**
   - Tienes **dos formas** increíbles de iniciar tu bot:
     - 📺 **Con consola visible (Normal):** Haz doble clic en `start.bat`. Verás la pantalla negra de comandos abierta de fondo.
     - 🤫 **Sin consola visible (Modo Silencioso - ¡Recomendado!):** Haz doble clic en `start-silencioso.vbs`. El bot se encenderá de forma **100% invisible en segundo plano** sin molestar en tus pantallas ni dejar ventanas negras de comandos.
   - En ambos casos, **se abrirá automáticamente una hermosa ventana flotante en tu pantalla** (el Panel de Control).
   - También puedes entrar en cualquier momento desde tu navegador web escribiendo: 👉 **`http://localhost:3000`**

---

## 🎮 Cómo Usarlo en tu Stream

Una vez que tengas la ventana del Panel de Control abierta, verás dos pestañas:

### 1️⃣ Pestaña "Principal"
* **Comando TTS:** El comando que usará tu chat para hablar. Por defecto es `!sp` (ejemplo: `!sp hola streamer`).
* **Voz Principal:** El nombre de la voz predeterminada en tu Speaker.bot.
* **Alias de Voces:** ¡Permite que tu chat elija qué voz usar! Puedes configurar palabras clave. Por ejemplo, si pones `sabina: Sabina`, cuando alguien escriba `!sp sabina hola` se usará la voz "Sabina".
* **Filtro de Palabras Prohibidas:** Escribe palabras que no quieras que el bot lea (groserías, insultos, etc.). Escribe una palabra por línea.
* **Botones "Iniciar" / "Detener":** Haz clic en **Iniciar** para que el bot empiece a leer tus chats. ¡Verás cómo cambia el estado de conexión a verde brillante!

### 2️⃣ Pestaña "Avanzado" ⚙️
* **ID de Chatroom de Kick:** Pega aquí tu identificador numérico de chatroom de Kick (hay un enlace rápido al lado para ayudarte a encontrarlo).
* **ID de Canal o Video de YouTube:** ¡Ya no necesitas buscar códigos raros! Puedes pegar directamente:
  - El **enlace de tu canal** (ej. `https://www.youtube.com/channel/UC...`)
  - O el **enlace del stream / video en vivo** directamente (ej. `https://www.youtube.com/watch?v=...` o `https://www.youtube.com/live/...`).
* **URL de Speaker.bot:** Dirección de conexión a tu Speaker.bot.
* **Cantidad Máxima de Caracteres:** ¡Evita que los "trolls" manden textos infinitos! Si alguien manda un texto que supere este límite, el bot lo recortará automáticamente y añadirá `...` al final.

> ⚠️ **¡No olvides hacer clic en "Guardar Configuración" cada vez que cambies algo para aplicar los cambios!**

---

## 💡 Consejos para Streamers

* **Evita Spams:** El bot cuenta con un filtro anti-spam integrado de forma automática para evitar que una misma persona sature las lecturas.
* **Trolls Controlados:** Si un espectador intenta mandar un insulto que esté en la lista de palabras prohibidas, verás en la consola de la aplicación un aviso en rojo indicando que el mensaje fue bloqueado.
* **Todo en un vistazo:** Puedes poner la ventana del panel de control a un lado de tu OBS para ver qué mensajes se están leyendo, cuántos mensajes van en total, y verificar que la conexión con Kick, YouTube y Speaker.bot esté al 100%.

¡Disfruta de más interacción con tu comunidad y diviértete con tu nuevo TTS! 🎙️✨
