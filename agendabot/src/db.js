const path = require('node:path');
const fs = require('node:fs');
const { createClient } = require('@libsql/client');

// Si TURSO_DATABASE_URL está definida (producción), usamos esa base de datos
// remota persistente. Si no, usamos un archivo SQLite local (para desarrollo,
// se pierde si la plataforma reinicia el disco).
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${path.join(DATA_DIR, 'agenda.db')}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const ready = client.batch(
  [
    `CREATE TABLE IF NOT EXISTS users (
      telegram_id   INTEGER PRIMARY KEY,
      home_address  TEXT,
      home_lat      REAL,
      home_lon      REAL,
      created_at    TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS events (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id               INTEGER NOT NULL,
      title                     TEXT NOT NULL,
      event_time                TEXT NOT NULL,
      recurrence_until          TEXT,
      location_text             TEXT,
      lat                       REAL,
      lon                       REAL,
      route_distance_km         REAL,
      route_duration_min        REAL,
      reminder_24h_sent_for       TEXT,
      reminder_departure_sent_for TEXT,
      created_at                TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_events_user ON events(telegram_id)`,
  ],
  'write',
);

// --------------------------------------------------------------------------
// Recurrencia: un evento con recurrence_until repite cada semana (mismo día
// y hora que event_time) hasta esa fecha inclusive. Uno sin recurrence_until
// es una cita puntual.
// --------------------------------------------------------------------------
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function nextOccurrence(eventTimeIso, recurrenceUntilIso, from) {
  const base = new Date(eventTimeIso);
  if (!recurrenceUntilIso) {
    return base >= from ? base : null;
  }
  const until = new Date(recurrenceUntilIso);
  if (base >= from) return base <= until ? base : null;
  const weeksAhead = Math.ceil((from.getTime() - base.getTime()) / WEEK_MS);
  const next = new Date(base.getTime() + weeksAhead * WEEK_MS);
  return next <= until ? next : null;
}

function withProjectedTime(ev, occurrence) {
  return { ...ev, event_time: occurrence.toISOString(), is_recurring: !!ev.recurrence_until };
}

async function getUser(telegramId) {
  await ready;
  const rs = await client.execute({ sql: 'SELECT * FROM users WHERE telegram_id = ?', args: [telegramId] });
  return rs.rows[0] || null;
}

async function setHome(telegramId, address, lat, lon) {
  await ready;
  await client.execute({
    sql: `INSERT INTO users (telegram_id, home_address, home_lat, home_lon)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(telegram_id) DO UPDATE SET
            home_address = excluded.home_address,
            home_lat = excluded.home_lat,
            home_lon = excluded.home_lon`,
    args: [telegramId, address, lat, lon],
  });
}

async function createEvent(telegramId, { title, eventTime, locationText, lat, lon, recurrenceUntil }) {
  await ready;
  const rs = await client.execute({
    sql: `INSERT INTO events (telegram_id, title, event_time, recurrence_until, location_text, lat, lon)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      telegramId,
      title,
      eventTime.toISOString(),
      recurrenceUntil ? recurrenceUntil.toISOString() : null,
      locationText || null,
      lat ?? null,
      lon ?? null,
    ],
  });
  return Number(rs.lastInsertRowid);
}

async function getAllUserEvents(telegramId) {
  await ready;
  const rs = await client.execute({ sql: 'SELECT * FROM events WHERE telegram_id = ?', args: [telegramId] });
  return rs.rows;
}

async function listUpcomingEvents(telegramId, limit = 20) {
  const now = new Date();
  const events = await getAllUserEvents(telegramId);
  const projected = events
    .map((ev) => {
      const occ = nextOccurrence(ev.event_time, ev.recurrence_until, now);
      return occ ? withProjectedTime(ev, occ) : null;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.event_time) - new Date(b.event_time));
  return projected.slice(0, limit);
}

async function listEventsBetween(telegramId, fromDate, toDate) {
  const events = await getAllUserEvents(telegramId);
  const projected = events
    .map((ev) => {
      const occ = nextOccurrence(ev.event_time, ev.recurrence_until, fromDate);
      return occ && occ <= toDate ? withProjectedTime(ev, occ) : null;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.event_time) - new Date(b.event_time));
  return projected;
}

async function deleteEvent(telegramId, id) {
  await ready;
  const rs = await client.execute({
    sql: 'DELETE FROM events WHERE id = ? AND telegram_id = ?',
    args: [id, telegramId],
  });
  return rs.rowsAffected > 0;
}

// Para el bucle de recordatorios: todos los eventos que aún tienen alguna
// ocurrencia futura (puntuales sin pasar, o recurrentes no caducados).
async function getEventsWithFutureOccurrences() {
  await ready;
  const rs = await client.execute(
    `SELECT * FROM events WHERE recurrence_until IS NULL OR recurrence_until >= datetime('now', '-7 days')`,
  );
  return rs.rows;
}

async function markReminderSent(id, field, occurrenceIso) {
  if (field !== 'reminder_24h_sent_for' && field !== 'reminder_departure_sent_for') {
    throw new Error(`Campo de recordatorio no válido: ${field}`);
  }
  await ready;
  await client.execute({ sql: `UPDATE events SET ${field} = ? WHERE id = ?`, args: [occurrenceIso, id] });
}

async function saveRoute(id, distanceKm, durationMin) {
  await ready;
  await client.execute({
    sql: 'UPDATE events SET route_distance_km = ?, route_duration_min = ? WHERE id = ?',
    args: [distanceKm, durationMin, id],
  });
}

module.exports = {
  getUser,
  setHome,
  createEvent,
  listUpcomingEvents,
  listEventsBetween,
  deleteEvent,
  getEventsWithFutureOccurrences,
  markReminderSent,
  saveRoute,
  nextOccurrence,
};
