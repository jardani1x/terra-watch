// ============================================================
//  distance.js — great-circle distance helpers (no deps)
//  Used for "event near me" / watchlist proximity checks. Operates on plain
//  lon/lat degrees so it is independent of the Three.js projection.
// ============================================================

const R_KM = 6371; // mean Earth radius
const toRad = (d) => (d * Math.PI) / 180;

/**
 * Great-circle distance between two lon/lat points.
 * @param {number} lon1 @param {number} lat1
 * @param {number} lon2 @param {number} lat2
 * @returns {number} kilometres
 */
export function haversineKm(lon1, lat1, lon2, lat2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Format a km distance for display: "820 m", "12.4 km", "1,340 km". */
export function fmtKm(km) {
  if (km == null || !isFinite(km)) return '—';
  if (km < 1) return Math.round(km * 1000) + ' m';
  if (km < 100) return km.toFixed(1) + ' km';
  return Math.round(km).toLocaleString('en-US') + ' km';
}

/**
 * Initial great-circle bearing (forward azimuth) from point 1 → point 2.
 * Operates on plain lon/lat degrees, independent of the Three.js projection.
 * @returns {number} degrees clockwise from true north, 0–360
 */
export function initialBearing(lon1, lat1, lon2, lat2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
