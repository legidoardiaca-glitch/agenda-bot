const cron = require('node-cron');
const db = require('./db');
const { getRoute } = require('./routing');
const { formatDateTime } = require('./utils');

const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const DEPARTURE_BUFFER_MIN = 10; // margen extra sobre el tiempo de viaje estimado
const NO_LOCATION_LEAD_MIN = 30; // aviso fijo si la cita no tiene ubicación

function startReminderLoop(bot) {
  cron.schedule('* * * * *', () => {
    checkReminders(bot).catch((err) => console.error('Error comprobando recordatorios:', err));
  });
  console.log('⏰ Recordatorios activados (comprobación cada minuto).');
}

async function checkReminders(bot) {
  const now = new Date();
  const events = await db.getEventsWithFutureOccurrences();

  for (const ev of events) {
    const occurrence = db.nextOccurrence(ev.event_time, ev.recurrence_until, now);
    if (!occurrence) continue; // no quedan ocurrencias futuras (ni siquiera hoy)

    const occIso = occurrence.toISOString();
    const msUntil = occurrence.getTime() - now.getTime();
    if (msUntil <= 0) continue;

    if (ev.reminder_24h_sent_for !== occIso && msUntil <= 24 * HOUR_MS) {
      await sendSafely(bot, ev.telegram_id, buildAdvanceMessage(ev, occurrence));
      await db.markReminderSent(ev.id, 'reminder_24h_sent_for', occIso);
    }

    if (ev.reminder_departure_sent_for !== occIso) {
      const leadMs = await resolveDepartureLeadMs(ev);
      if (msUntil <= leadMs) {
        await sendSafely(bot, ev.telegram_id, buildDepartureMessage(ev, occurrence));
        await db.markReminderSent(ev.id, 'reminder_departure_sent_for', occIso);
      }
    }
  }
}

async function resolveDepartureLeadMs(ev) {
  if (ev.lat == null || ev.lon == null) {
    return NO_LOCATION_LEAD_MIN * MIN_MS;
  }

  if (ev.route_duration_min != null) {
    return (ev.route_duration_min + DEPARTURE_BUFFER_MIN) * MIN_MS;
  }

  const user = await db.getUser(ev.telegram_id);
  if (!user?.home_lat || !user?.home_lon) {
    // Sin "casa" configurada no podemos calcular el trayecto: usa el aviso fijo.
    return NO_LOCATION_LEAD_MIN * MIN_MS;
  }

  const route = await getRoute(
    { lat: user.home_lat, lon: user.home_lon },
    { lat: ev.lat, lon: ev.lon },
  );
  if (!route) return NO_LOCATION_LEAD_MIN * MIN_MS;

  await db.saveRoute(ev.id, route.distanceKm, route.durationMin);
  ev.route_distance_km = route.distanceKm;
  ev.route_duration_min = route.durationMin;
  return (route.durationMin + DEPARTURE_BUFFER_MIN) * MIN_MS;
}

function buildAdvanceMessage(ev, occurrence) {
  const when = formatDateTime(occurrence);
  let msg = `📅 Recordatorio: *${ev.title}* es mañana a las ${when}.`;
  if (ev.location_text) msg += `\n📍 ${ev.location_text}`;
  return msg;
}

function buildDepartureMessage(ev, occurrence) {
  const when = formatDateTime(occurrence);
  let msg = `🔔 *${ev.title}* empieza a las ${when}.`;
  if (ev.route_distance_km != null) {
    msg += `\n🚗 Salida recomendada ya: ${ev.route_distance_km.toFixed(1)} km, ~${Math.round(ev.route_duration_min)} min hasta el lugar.`;
  } else if (ev.location_text) {
    msg += `\n📍 ${ev.location_text}\n(Configura tu ubicación con /casa para que calcule el tiempo de viaje.)`;
  } else {
    msg += '\n¡En unos 30 minutos!';
  }
  return msg;
}

async function sendSafely(bot, telegramId, text) {
  try {
    await bot.telegram.sendMessage(telegramId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error(`No se pudo enviar recordatorio a ${telegramId}:`, err.message);
  }
}

module.exports = { startReminderLoop };
