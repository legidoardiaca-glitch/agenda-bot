require('dotenv').config();

const { Telegraf, Scenes, session, Markup } = require('telegraf');
const chrono = require('chrono-node');

const db = require('./db');
const { geocodeAddress } = require('./geocode');
const { startReminderLoop } = require('./reminders');
const { formatEventLine } = require('./utils');
const { startHealthServer } = require('./health');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ Falta TELEGRAM_BOT_TOKEN en el archivo .env (copia .env.example a .env y rellénalo).');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ---------------------------------------------------------------------------
// Asistente guiado para crear una cita: /nueva
// ---------------------------------------------------------------------------
const nuevaEventoScene = new Scenes.WizardScene(
  'nueva-evento',
  async (ctx) => {
    ctx.wizard.state.event = {};
    await ctx.reply('¿Cómo se llama la cita? (ej. "Dentista", "Cena con Marta")');
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message?.text) {
      await ctx.reply('Escríbeme el título en texto, por favor.');
      return;
    }
    ctx.wizard.state.event.title = ctx.message.text.trim();
    await ctx.reply('¿Cuándo es? Puedes escribirlo en lenguaje natural, ej. "mañana a las 18:00" o "25/12 10:30".');
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = ctx.message?.text;
    if (!text) {
      await ctx.reply('Dime la fecha y hora en texto.');
      return;
    }
    const parsed = chrono.es.parseDate(text, new Date(), { forwardDate: true });
    if (!parsed) {
      await ctx.reply('No he entendido la fecha. Prueba de nuevo, ej. "mañana 18:00" o "viernes a las 9".');
      return;
    }
    ctx.wizard.state.event.eventTime = parsed;
    await ctx.reply(
      `Entendido: ${parsed.toLocaleString('es-ES')}.\n¿Dónde es? Escribe la dirección o el lugar, o envía "-" si no hay ubicación.`,
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      await ctx.reply('Escríbeme la ubicación o "-" para omitirla.');
      return;
    }
    const ev = ctx.wizard.state.event;

    if (text !== '-') {
      await ctx.reply('Buscando esa ubicación...');
      const geo = await geocodeAddress(text);
      if (!geo) {
        await ctx.reply('No he encontrado esa dirección. Prueba a escribirla de otra forma, o envía "-" para omitirla.');
        return;
      }
      ev.locationText = geo.displayName;
      ev.lat = geo.lat;
      ev.lon = geo.lon;
    }

    const resumen =
      `📅 *${ev.title}*\n🕒 ${ev.eventTime.toLocaleString('es-ES')}` +
      (ev.locationText ? `\n📍 ${ev.locationText}` : '');
    await ctx.reply(`${resumen}\n\n¿Confirmo?`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        Markup.button.callback('✅ Guardar', 'nueva_confirmar'),
        Markup.button.callback('❌ Cancelar', 'nueva_cancelar'),
      ]),
    });
    return ctx.wizard.next();
  },
  async (ctx) => {
    // Este paso solo existe para mantener vivo el estado del wizard
    // mientras se espera la pulsación de uno de los botones de arriba.
    await ctx.reply('Usa los botones de arriba para confirmar o cancelar 🙂');
  },
);

nuevaEventoScene.action('nueva_confirmar', async (ctx) => {
  const ev = ctx.wizard.state.event;
  const id = db.createEvent(ctx.from.id, ev);
  await ctx.answerCbQuery();
  await ctx.editMessageReplyMarkup();
  await ctx.reply(`✅ Guardado con el nº ${id}. Te avisaré antes de la cita.`);
  return ctx.scene.leave();
});

nuevaEventoScene.action('nueva_cancelar', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageReplyMarkup();
  await ctx.reply('Cita cancelada.');
  return ctx.scene.leave();
});

const stage = new Scenes.Stage([nuevaEventoScene]);
bot.use(session());
bot.use(stage.middleware());

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------
const WELCOME_TEXT =
  '¡Hola! Soy tu agenda personal 🗓️\n\n' +
  'Comandos:\n' +
  '/nueva – añadir una cita paso a paso\n' +
  '/agenda – ver tus próximas citas\n' +
  '/hoy – ver las citas de hoy\n' +
  '/eliminar <nº> – borrar una cita\n' +
  '/casa <dirección> – fija tu ubicación de partida (para calcular tiempo y distancia)\n' +
  '/ayuda – mostrar esta ayuda\n\n' +
  'También puedes escribirme directamente, ej.:\n' +
  '"Dentista mañana a las 10 en Manacor"';

bot.start((ctx) => ctx.reply(WELCOME_TEXT));
bot.command('ayuda', (ctx) => ctx.reply(WELCOME_TEXT));

bot.command('nueva', (ctx) => ctx.scene.enter('nueva-evento'));

bot.command('casa', async (ctx) => {
  const address = ctx.message.text.replace(/^\/casa(@\w+)?\s*/i, '').trim();
  if (!address) {
    const user = db.getUser(ctx.from.id);
    if (user?.home_address) {
      await ctx.reply(`Tu ubicación actual es: 📍 ${user.home_address}`);
    } else {
      await ctx.reply('Aún no has fijado tu ubicación. Usa: /casa <dirección>');
    }
    return;
  }
  await ctx.reply('Buscando esa dirección...');
  const geo = await geocodeAddress(address);
  if (!geo) {
    await ctx.reply('No he encontrado esa dirección, prueba con otra redacción.');
    return;
  }
  db.setHome(ctx.from.id, geo.displayName, geo.lat, geo.lon);
  await ctx.reply(`📍 Ubicación guardada: ${geo.displayName}\nA partir de ahora calcularé el tiempo y la distancia hasta cada cita desde aquí.`);
});

bot.command('agenda', async (ctx) => {
  const events = db.listUpcomingEvents(ctx.from.id, 20);
  if (!events.length) {
    await ctx.reply('No tienes citas próximas. Usa /nueva para añadir una.');
    return;
  }
  const text = events.map(formatEventLine).join('\n\n');
  await ctx.reply(text, { parse_mode: 'Markdown' });
});

bot.command('hoy', async (ctx) => {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const events = db.listEventsBetween(ctx.from.id, now, endOfDay);
  if (!events.length) {
    await ctx.reply('No tienes más citas hoy.');
    return;
  }
  await ctx.reply(events.map(formatEventLine).join('\n\n'), { parse_mode: 'Markdown' });
});

bot.command('eliminar', async (ctx) => {
  const arg = ctx.message.text.replace(/^\/eliminar(@\w+)?\s*/i, '').trim();
  const id = parseInt(arg, 10);
  if (!id) {
    await ctx.reply('Indica el número de la cita, ej. /eliminar 3 (usa /agenda para ver los números).');
    return;
  }
  const ok = db.deleteEvent(ctx.from.id, id);
  await ctx.reply(ok ? `🗑️ Cita #${id} eliminada.` : `No he encontrado la cita #${id}.`);
});

// ---------------------------------------------------------------------------
// Alta rápida en lenguaje natural (fuera del asistente /nueva)
// Ej.: "Dentista mañana a las 10 en Manacor"
// ---------------------------------------------------------------------------
// Nota: mientras el asistente /nueva está activo, Telegraf enruta los
// mensajes a los pasos del wizard y este handler global no llega a ejecutarse.
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;

  const results = chrono.es.parse(text, new Date(), { forwardDate: true });
  if (!results.length) {
    await ctx.reply(
      'No te he entendido. Prueba con /nueva para el asistente guiado, o escribe algo como\n"Dentista mañana a las 10 en Manacor".',
    );
    return;
  }

  const result = results[0];
  const eventTime = result.date();

  // Extrae "en <lugar>" si existe; el resto (menos la fecha) se usa como título.
  let rest = (text.slice(0, result.index) + text.slice(result.index + result.text.length)).trim();
  let locationQuery = null;
  const enMatch = rest.match(/\ben\s+(.+)$/i);
  if (enMatch) {
    locationQuery = enMatch[1].trim();
    rest = rest.slice(0, enMatch.index).trim();
  }
  rest = rest.replace(/[,.\-–]+$/, '').trim();
  // Quita artículos/preposiciones sueltos que quedan pegados a la fecha, ej. "Reunión el" -> "Reunión".
  rest = rest.replace(/\s+(el|la|los|las|del|al)$/i, '').trim();
  const title = rest || 'Cita';

  let locationText = null;
  let lat = null;
  let lon = null;
  if (locationQuery) {
    const geo = await geocodeAddress(locationQuery);
    if (geo) {
      locationText = geo.displayName;
      lat = geo.lat;
      lon = geo.lon;
    }
  }

  ctx.session.pendingQuickEvent = { title, eventTime, locationText, lat, lon };

  const resumen =
    `📅 *${title}*\n🕒 ${eventTime.toLocaleString('es-ES')}` + (locationText ? `\n📍 ${locationText}` : '');
  await ctx.reply(`${resumen}\n\n¿Confirmo?`, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      Markup.button.callback('✅ Guardar', 'quick_confirmar'),
      Markup.button.callback('❌ Cancelar', 'quick_cancelar'),
    ]),
  });
});

bot.action('quick_confirmar', async (ctx) => {
  const ev = ctx.session?.pendingQuickEvent;
  await ctx.answerCbQuery();
  await ctx.editMessageReplyMarkup();
  if (!ev) {
    await ctx.reply('Esa propuesta ya ha caducado, vuelve a escribirla.');
    return;
  }
  const id = db.createEvent(ctx.from.id, ev);
  ctx.session.pendingQuickEvent = null;
  await ctx.reply(`✅ Guardado con el nº ${id}. Te avisaré antes de la cita.`);
});

bot.action('quick_cancelar', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageReplyMarkup();
  ctx.session.pendingQuickEvent = null;
  await ctx.reply('Vale, no la guardo.');
});

// ---------------------------------------------------------------------------
bot.catch((err, ctx) => {
  console.error(`Error procesando el update ${ctx.updateType}:`, err);
});

startReminderLoop(bot);
startHealthServer();

bot.launch().then(() => console.log('🤖 Bot en marcha (long polling). Ctrl+C para detenerlo.'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
