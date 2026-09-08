// Cálculo de distancia/tiempo de viaje usando el servidor demo público de OSRM.
// Solo soporta perfil "driving" (coche) y es de uso limitado (no intensivo).
// Para uso serio a largo plazo, aloja tu propio OSRM o usa OpenRouteService.
// https://project-osrm.org/docs/v5.24.0/api/

const PROFILE = process.env.TRAVEL_PROFILE || 'driving';

async function getRoute(origin, destination) {
  const url =
    `https://router.project-osrm.org/route/v1/${PROFILE}/` +
    `${origin.lon},${origin.lat};${destination.lon},${destination.lat}` +
    '?overview=false&alternatives=false&steps=false';

  const res = await fetch(url);
  if (!res.ok) {
    console.error('OSRM error', res.status, await res.text().catch(() => ''));
    return null;
  }
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) return null;

  const route = data.routes[0];
  return {
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
  };
}

module.exports = { getRoute };
