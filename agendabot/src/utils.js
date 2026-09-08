function formatDateTime(date) {
  return date.toLocaleString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatEventLine(ev) {
  const when = formatDateTime(new Date(ev.event_time));
  let line = `#${ev.id} · *${ev.title}*\n   🕒 ${when}`;
  if (ev.location_text) line += `\n   📍 ${ev.location_text}`;
  if (ev.route_distance_km != null && ev.route_duration_min != null) {
    line += `\n   🚗 ${ev.route_distance_km.toFixed(1)} km · ${Math.round(ev.route_duration_min)} min`;
  }
  return line;
}

module.exports = { formatDateTime, formatEventLine };
