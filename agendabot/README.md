# agenda-bot

Bot de Telegram que gestiona tu agenda personal y te avisa antes de cada
cita — incluyendo el **tiempo y la distancia de viaje** desde tu ubicación
hasta el lugar de la cita, calculados en tiempo real.

No depende de Google Calendar ni de ningún servicio externo de calendario:
las citas se guardan en una base de datos SQLite (o [Turso](https://turso.tech/),
ver más abajo, para que no se borren si el servidor se reinicia).

## Qué hace

- **`/nueva`** — asistente guiado para añadir una cita puntual (título,
  fecha/hora, ubicación).
- **`/nuevaclase`** — asistente guiado para añadir algo que se repite **cada
  semana** al mismo día y hora (horario de universidad/trabajo, clases
  extraescolares...). Se repite hasta la fecha que le digas.
- **Alta rápida en lenguaje natural** — para citas puntuales, puedes escribir
  directamente algo como `Dentista mañana a las 10 en Manacor` y el bot te
  pedirá confirmación.
- **`/agenda`** y **`/hoy`** — ver tus próximas citas y clases (las
  recurrentes se marcan con 🔁).
- **`/eliminar <nº>`** — borrar una cita o una clase (borra todas sus
  repeticiones futuras).
- **`/casa <dirección>`** — fija tu punto de partida habitual.
- **Recordatorios automáticos** (se repiten cada semana para las clases):
  - Un aviso ~24 h antes.
  - Un aviso de "hora de salida" calculado con la distancia y el tiempo de
    viaje real (en coche) desde tu `/casa` hasta el lugar, con un margen de
    10 minutos.
  - Si no hay ubicación o no has fijado `/casa`, el aviso de salida se manda
    con 30 minutos fijos de antelación.

## Cómo funciona por dentro

- **Telegram**: [Telegraf](https://telegraf.js.org/), en modo *long
  polling* (no necesita dominio propio ni certificados, solo salida a
  internet — por eso puede correr igual de bien en tu ordenador, una
  Raspberry Pi, o un servicio en la nube como Koyeb).
- **Base de datos**: [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts),
  compatible con SQLite. Sin configurar nada usa un archivo local
  (`data/agenda.db`); si defines `TURSO_DATABASE_URL` (y `TURSO_AUTH_TOKEN`)
  usa una base de datos Turso remota y persistente — imprescindible si
  despliegas en una plataforma con disco no persistente como Render.
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

### 2A. Desplegarlo gratis en la nube (recomendado, sin terminal) — Render + UptimeRobot

Con esto el bot queda funcionando siempre, sin depender de tu ordenador.
Todo se hace desde el navegador. Usamos dos servicios gratuitos:
**Render** (donde corre el bot) y **UptimeRobot** (que lo "despierta" cada
pocos minutos, porque el plan gratuito de Render duerme el servicio tras
15 minutos sin recibir peticiones).

> Antes se recomendaba Koyeb, pero su panel ha cambiado (están integrando
> el producto con Mistral AI y el alta de servicios "normales" ya no es
> tan directa) — por eso el camino de abajo usa Render en su lugar.

1. **Sube el código a GitHub** (sin usar git desde la terminal):
   - Entra en [github.com](https://github.com) → **New repository** → dale
     un nombre (ej. `agenda-bot`) → **Create repository**.
   - En la página del repo recién creado, pulsa **uploading an existing
     file** (o "Add file → Upload files").
   - Arrastra ahí toda la carpeta `agenda-bot` que descomprimiste (con
     `src/`, `package.json`, `README.md`... — **no** hace falta subir
     `node_modules` ni `.env`, no existen todavía).
   - Baja y pulsa **Commit changes**.
2. **Crea cuenta en [Render](https://render.com/)** (gratis, con GitHub o
   email).
3. En el dashboard: **New** → **Web Service** → conecta tu cuenta de
   GitHub si te lo pide → elige el repositorio `agenda-bot`.
4. Configura el servicio:
   - **Name**: `agenda-bot` (o el que quieras).
   - **Runtime**: Node.
   - **Build Command**: `npm install`.
   - **Start Command**: `npm start`.
   - **Instance Type**: **Free**.
5. En **Environment Variables**, añade:
   - `TELEGRAM_BOT_TOKEN` = tu token de BotFather
   - `TZ` = `Europe/Madrid`
6. Pulsa **Create Web Service**. En los *logs* deberías ver
   `🤖 Bot en marcha (long polling)`. Copia la URL que te asigna Render
   (algo como `https://agenda-bot-xxxx.onrender.com`).
7. Habla con tu bot en Telegram — ya debería responder.
8. **Evita que se duerma**: crea cuenta gratis en
   [UptimeRobot](https://uptimerobot.com/) → **Add New Monitor** → tipo
   *HTTP(s)* → pega la URL de Render del paso 6 → intervalo **5 minutes**
   → guardar. Así Render recibe una visita cada 5 minutos y no apaga el
   servicio, con lo que los recordatorios se siguen enviando puntuales.

> Nota: los planes y límites gratuitos de estas plataformas cambian con el
> tiempo; revisa las condiciones vigentes al crear la cuenta.

### ⚠️ Imprescindible en Render (o cualquier plataforma "sin disco"): base de datos persistente con Turso

Render (plan gratuito) **borra todo el disco cada vez que el servicio se
reinicia o se vuelve a desplegar**. Sin esto, tus citas y clases
desaparecerían con el próximo cambio de código. Turso es gratuito, guarda
los datos de verdad y se configura por navegador, sin terminal.

1. Ve a [turso.tech](https://turso.tech/) → crea cuenta gratis (con GitHub
   o email).
2. En su panel (`app.turso.tech` o similar según la versión), crea una base
   de datos nueva (**Create Database**), dale un nombre (ej. `agenda-bot`) y
   elige la región más cercana.
3. Dentro de la base de datos, busca la URL de conexión (empieza por
   `libsql://...`) y genera un **token de acceso** (**Create Token** /
   **Generate Token**). Copia ambos valores.
4. En Render, ve a tu servicio → **Environment** → añade:
   - `TURSO_DATABASE_URL` = la URL `libsql://...`
   - `TURSO_AUTH_TOKEN` = el token que has generado
5. **Save Changes** → Render volverá a desplegar automáticamente. A partir
   de ahora, todo lo que guardes en el bot sobrevive a reinicios y a
   futuros despliegues.

> Si la interfaz de Turso no coincide exactamente con estos pasos (cambia
> de vez en cuando), busca las opciones equivalentes: crear base de datos,
> ver su URL de conexión y generar un token — son los tres datos que hacen
> falta.

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
3. `/nuevaclase` — añade una clase semanal, ej. horario de universidad:
   título, próxima sesión ("martes 17:00"), lugar y hasta cuándo se repite.
4. `/agenda` — comprueba que ha quedado guardada (las clases llevan 🔁).
5. Espera los avisos automáticos, o cambia temporalmente la hora de la
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
- La sesión de Telegraf (para los asistentes `/nueva`/`/nuevaclase` y la
  confirmación de alta rápida) vive en memoria: si el bot se reinicia a
  mitad de una conversación, tendrás que empezar de nuevo esa cita o clase
  concreta (las ya guardadas no se pierden si usas Turso).
- Las clases semanales no tienen en cuenta festivos ni semanas sin clase:
  si un día no hay sesión, tendrás que borrar/ignorar ese aviso concreto a
  mano.
