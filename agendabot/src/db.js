const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'agenda.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id   INTEGER PRIMARY KEY,
    home_address  TEXT,
    home_lat      REAL,
    home_lon      REAL,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id             INTEGER NOT NULL,
    title                   TEXT NOT NULL,
    event_time              TEXT NOT NULL,
    location_text           TEXT,
    lat                     REAL,
    lon                     REAL,
    route_distance_km       REAL,
    route_duration_min      REAL,
    reminder_24h_sent       INTEGER NOT NULL DEFAULT 0,
    reminder_departure_sent INTEGER NOT NULL DEFAULT 0,
    created_at              TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_events_time ON events(event_time);
`);

function getUser(telegramId) {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

function setHome(telegramId, address, lat, lon) {
  db.prepare(`
    INSERT INTO users (telegram_id, home_address, home_lat, home_lon)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      home_address = excluded.home_address,
      home_lat = excluded.home_lat,
      home_lon = excluded.home_lon
  `).run(telegramId, address, lat, lon);
}

function createEvent(telegramId, { title, eventTime, locationText, lat, lon }) {
  const info = db.prepare(`
    INSERT INTO events (telegram_id, title, event_time, location_text, lat, lon)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(telegramId, title, eventTime.toISOString(), locationText || null, lat ?? null, lon ?? null);
  return info.lastInsertRowid;
}

function listUpcomingEvents(telegramId, limit = 20) {
  const nowIso = new Date().toISOString();
  return db.prepare(`
    SELECT * FROM events
    WHERE telegram_id = ? AND event_time > ?
    ORDER BY event_time ASC
    LIMIT ?
  `).all(telegramId, nowIso, limit);
}

function listEventsBetween(telegramId, fromDate, toDate) {
  return db.prepare(`
    SELECT * FROM events
    WHERE telegram_id = ? AND event_time BETWEEN ? AND ?
    ORDER BY event_time ASC
  `).all(telegramId, fromDate.toISOString(), toDate.toISOString());
}

function deleteEvent(telegramId, id) {
  const info = db.prepare('DELETE FROM events WHERE id = ? AND telegram_id = ?').run(id, telegramId);
  return info.changes > 0;
}

function getFutureEventsNeedingReminders() {
  const nowIso = new Date().toISOString();
  return db.prepare(`
    SELECT * FROM events
    WHERE event_time > ?
      AND (reminder_24h_sent = 0 OR reminder_departure_sent = 0)
    ORDER BY event_time ASC
  `).all(nowIso);
}

function markReminderSent(id, field) {
  if (field !== 'reminder_24h_sent' && field !== 'reminder_departure_sent') {
    throw new Error(`Campo de recordatorio no válido: ${field}`);
  }
  db.prepare(`UPDATE events SET ${field} = 1 WHERE id = ?`).run(id);
}

function saveRoute(id, distanceKm, durationMin) {
  db.prepare('UPDATE events SET route_distance_km = ?, route_duration_min = ? WHERE id = ?')
    .run(distanceKm, durationMin, id);
}

module.exports = {
  getUser,
  setHome,
  createEvent,
  listUpcomingEvents,
  listEventsBetween,
  deleteEvent,
  getFutureEventsNeedingReminders,
  markReminderSent,
  saveRoute,
};
