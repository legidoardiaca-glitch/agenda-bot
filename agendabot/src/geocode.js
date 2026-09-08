// Geocodificación de direcciones usando Nominatim (OpenStreetMap), gratuito.
// Política de uso justo: máx. ~1 petición/segundo y User-Agent identificable.
// https://operations.osmfoundation.org/policies/nominatim/

let lastRequestAt = 0;

async function throttle() {
  const minGapMs = 1100;
  const wait = lastRequestAt + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function geocodeAddress(query) {
  await throttle();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '0');

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'agenda-bot/1.0 (uso personal, Telegram)',
      'Accept-Language': 'es',
    },
  });
  if (!res.ok) {
    console.error('Nominatim error', res.status, await res.text().catch(() => ''));
    return null;
  }
  const results = await res.json();
  if (!results.length) return null;

  const best = results[0];
  return {
    displayName: best.display_name,
    lat: parseFloat(best.lat),
    lon: parseFloat(best.lon),
  };
}

module.exports = { geocodeAddress };
