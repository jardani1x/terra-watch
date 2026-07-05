import type { Feature, Polygon } from 'geojson';

/** Day/night terminator: the night hemisphere as a GeoJSON polygon, computed
 *  from the sun's subsolar point at `date`. Pure astronomy — no data source,
 *  no network. Standard low-precision solar position (good to ~0.01°, far
 *  beyond what a world map needs). */
export function nightPolygon(date: Date = new Date()): Feature<Polygon> {
  const rad = Math.PI / 180;
  const n = date.getTime() / 86400000 - 10957.5; // days since J2000.0
  const L = (280.46 + 0.9856474 * n) % 360; // mean longitude
  const g = ((357.528 + 0.9856003 * n) % 360) * rad; // mean anomaly
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad; // ecliptic longitude
  const eps = (23.439 - 0.0000004 * n) * rad; // obliquity
  const alpha = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)); // right ascension
  const delta = Math.asin(Math.sin(eps) * Math.sin(lambda)); // declination
  const gst = ((18.697374558 + 24.06570982441908 * n) % 24) * 15 * rad; // Greenwich sidereal angle

  // terminator latitude for each longitude; night side closes over the pole
  // opposite the sun
  const ring: [number, number][] = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    const H = gst + lon * rad - alpha; // hour angle at this longitude
    const lat = Math.atan(-Math.cos(H) / Math.tan(delta)) / rad;
    ring.push([lon, lat]);
  }
  const poleLat = delta > 0 ? -90 : 90;
  ring.push([180, poleLat], [-180, poleLat], ring[0]);

  return {
    type: 'Feature',
    properties: { computedAt: date.toISOString() },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}
