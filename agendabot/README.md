# agenda-bot

Bot de Telegram que gestiona tu agenda personal y te avisa antes de cada
cita — incluyendo el **tiempo y la distancia de viaje** desde tu ubicación
hasta el lugar de la cita, calculados en tiempo real.

No depende de Google Calendar ni de ningún servicio externo de calendario:
las citas se guardan en una base de datos SQLite local (`data/agenda.db`).

## Qué hace

- **`/nueva`** — asistente guiado paso a paso para añadir una cita (título,
  fecha/hora, ubicación).
- **Alta rápida en lenguaje natural** — puedes escribir directamente algo
  como `Dentista mañana a las 10 en Manacor` y el bot te pedirá confirmación.
- **`/agenda`** y **`/hoy`** — ver tus próximas citas.
- **`/eliminar <nº>`** — borrar una cita.
- **`/casa <dirección>`** — fija tu punto de partida habitual.
- **Recordatorios automáticos**:
  - Un aviso ~24 h antes de la cita.
  - Un aviso de "hora de salida" calculado con la distancia y el tiempo de
    viaje real (en coche) desde tu `/casa` hasta el lugar de la cita, con
    un margen de 10 minutos.
  - Si la cita no tiene ubicación o no has fijado `/casa`, el aviso de
    salida se manda con 30 minutos fijos de antelación.

## Cómo funciona por dentro

- **Telegram**: [Telegraf](https://telegraf.js.org/), en modo *long
  polling* (no necesita dominio propio ni certificados, solo salida a
  internet — por eso puede correr igual de bien en tu ordenador, una
  Raspberry Pi, o un servicio en la nube como Koyeb).
- **Base de datos**: SQLite vía `better-sqlite3` (`data/agenda.db`, se crea
  sola al arrancar).
- **Fechas en lenguaje natural**: [`chrono-node`](https://github.com/wanasit/chrono)
  (locale español).
- **Geocodificación** (dirección → coordenadas): [Nominatim](https://nominatim.org/)
  (OpenStreetMap), gratuito, con el límite de 1 petición/segundo que exige
  su política de uso.
- **Distancia y tiempo de viaje**: [OSRM](https://project-osrm.org/) —
  usa el servidor demo público (`router.project-osrm.org`), gratuito pero
  solo con perfil de **coche** y pensado para uso ligero, no intensivo.
- **Recordatorios**: [`node-cron`](https://github.com/node-cron/node-cron)
  revisa cada minuto qué avisos tocan enviar.

## ⚠️ Importante: esto necesita correr en algún sitio 24/7

@BotFather solo registra el bot y te da el token; **no ejecuta tu código**.
Para que el bot responda y te avise de tus citas, este proyecto tiene que
estar corriendo de forma continua en algún ordenador con internet — el tuyo,
o (recomendado si no quieres depender de tenerlo encendido) un servidor
gratuito en la nube. Más abajo tienes las dos opciones.

## Puesta en marcha

### 1. Crear el bot en Telegram

1. Abre Telegram y busca **@BotFather**.
2. Envíale `/newbot` y sigue los pasos (nombre y usuario del bot).
3. Te dará un **token** con esta pinta: `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.

### 2A. Desplegarlo gratis en la nube (recomendado, sin terminal) — Koyeb

Con esto el bot queda funcionando siempre, sin depender de tu ordenador.
Todo se hace desde el navegador.

1. **Sube el código a GitHub** (sin usar git desde la terminal):
   - Entra en [github.com](https://github.com) → **New repository** → dale
     un nombre (ej. `agenda-bot`) → **Create repository**.
   - En la página del repo recién creado, pulsa **uploading an existing
     file** (o "Add file → Upload files").
   - Arrastra ahí toda la carpeta `agenda-bot` que descomprimiste (con
     `src/`, `package.json`, `README.md`... — **no** hace falta subir
     `node_modules` ni `.env`, no existen todavía).
   - Baja y pulsa **Commit changes**.
2. **Crea cuenta en [Koyeb](https://www.koyeb.com/)** (gratis, con GitHub
   o email).
3. En el panel de Koyeb: **Create Service** → **GitHub** → autoriza acceso
   y elige el repositorio `agenda-bot` que acabas de subir.
4. Koyeb detecta que es un proyecto Node.js automáticamente. Configúralo:
   - **Build**: por defecto (`npm install`).
   - **Run command**: `npm start`.
   - **Port**: `3000` (es el puerto del healthcheck interno del bot).
   - **Instance type**: elige la opción **Free/Nano**.
5. En la sección **Environment variables**, añade (como *secret* si te lo
   ofrece, para que no quede visible):
   - `TELEGRAM_BOT_TOKEN` = tu token de BotFather
   - `TZ` = `Europe/Madrid`
6. Pulsa **Deploy**. En un par de minutos, en los *logs* del servicio
   deberías ver `🤖 Bot en marcha (long polling)`.
7. Habla con tu bot en Telegram — ya debería responder sin que tengas
   nada encendido en casa.

> Nota: los planes y límites gratuitos de estas plataformas cambian con el
> tiempo; revisa las condiciones vigentes al crear la cuenta. Si Koyeb ya
> no ofrece un plan gratuito adecuado, el mismo procedimiento (conectar el
> repositorio de GitHub por la web, sin terminal) funciona en alternativas
> similares como Render o Railway.

### 2B. Alternativa: correrlo en tu propio ordenador

```bash
cd agenda-bot
npm install
cp .env.example .env
```

Edita `.env` y pega tu token:

```
TELEGRAM_BOT_TOKEN=123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TZ=Europe/Madrid
```

Y arranca:

```bash
npm start
```

Verás `🤖 Bot en marcha (long polling)`. Abre Telegram, busca tu bot por
el usuario que le diste en BotFather y envíale `/start`.

El proceso tiene que quedarse corriendo para que el bot responda y para
que se envíen los recordatorios (no hace falta abrir ningún puerto ni
tener IP pública). Para dejarlo funcionando de forma permanente en tu
ordenador puedes usar, por ejemplo, `pm2`:

```bash
npm install -g pm2
pm2 start src/bot.js --name agenda-bot
pm2 save
```

## Primeros pasos con el bot

1. `/casa Carrer Major 5, Manacor` — para que calcule tiempos de viaje.
2. `/nueva` — añade tu primera cita, o simplemente escribe algo como
   `Cena con Ana el viernes a las 21:00 en Port d'Alcúdia`.
3. `/agenda` — comprueba que ha quedado guardada.
4. Espera los avisos automáticos, o cambia temporalmente la hora de la
   cita a "dentro de 2 minutos" mientras pruebas para ver el recordatorio
   en acción.

## Límites conocidos / próximos pasos

- El servidor demo de OSRM solo calcula rutas en coche y no está pensado
  para mucho tráfico; si el bot lo va a usar más de una persona o muy a
  menudo, aloja tu propio OSRM o cambia a
  [OpenRouteService](https://openrouteservice.org/) (tiene API key
  gratuita y soporta a pie / bici / coche).
- Nominatim limita a 1 búsqueda de dirección por segundo; para un uso
  personal no da problemas.
- Multiusuario: el bot ya distingue citas y "casa" por cada `telegram_id`,
  así que varias personas pueden usarlo a la vez sin mezclarse.
- La sesión de Telegraf (para el asistente `/nueva` y la confirmación de
  alta rápida) vive en memoria: si reinicias el bot a mitad de una
  conversación, tendrás que empezar de nuevo esa cita concreta (las ya
  guardadas no se pierden, están en `data/agenda.db`).
