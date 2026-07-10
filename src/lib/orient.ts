/** Where "home" is for the 3D globe orient: the user's own GPS fix when the
 *  opt-in locate watch has one, else a longitude estimated from the browser
 *  timezone (UTC offset × 15°/hour). 20°N default latitude keeps the
 *  populated mid-latitudes in view. Pure; no network, nothing persisted. */
export function homePosition(
  pos: { lat: number; lon: number } | null,
  offsetMinutes: number = new Date().getTimezoneOffset(),
): { lon: number; lat: number } {
  if (pos) return { lon: pos.lon, lat: pos.lat };
  // getTimezoneOffset() is minutes *west* of UTC (UTC+8 → -480), so negate;
  // clamp — some historical zones exceed ±12 h
  const lon = Math.max(-180, Math.min(180, (-offsetMinutes / 60) * 15));
  return { lon, lat: 20 };
}
