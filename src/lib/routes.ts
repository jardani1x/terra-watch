import type { Feature, FeatureCollection, LineString } from 'geojson';
import { CHOKEPOINTS, type Chokepoint } from './chokepoints';

/** Reference trade-corridor segments between chokepoints — public-knowledge
 *  geography (advisory reference lines, not live routing or traffic). */
const ROUTE_PAIRS: [string, string][] = [
  ['taiwan', 'malacca'],
  ['malacca', 'bab-el-mandeb'],
  ['bab-el-mandeb', 'suez'],
  ['suez', 'gibraltar'],
  ['gibraltar', 'dover'],
  ['hormuz', 'bab-el-mandeb'],
  ['hormuz', 'malacca'],
  ['panama', 'gibraltar'],
];

/** n points along the great circle from a to b (inclusive). */
export function greatCirclePoints(a: [number, number], b: [number, number], n = 32): [number, number][] {
  const rad = Math.PI / 180;
  const [lon1, lat1, lon2, lat2] = [a[0] * rad, a[1] * rad, b[0] * rad, b[1] * rad];
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
  ));
  if (d === 0) return [a, b];
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    pts.push([Math.atan2(y, x) / rad, Math.atan2(z, Math.sqrt(x * x + y * y)) / rad]);
  }
  return pts;
}

/** Trade-route reference lines as a FeatureCollection. */
export function tradeRouteLines(): FeatureCollection<LineString> {
  const byId = new Map<string, Chokepoint>(CHOKEPOINTS.map((c) => [c.id, c]));
  const features: Feature<LineString>[] = [];
  for (const [fromId, toId] of ROUTE_PAIRS) {
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to) continue;
    features.push({
      type: 'Feature',
      properties: { id: `${fromId}-${toId}`, name: `${from.name} ↔ ${to.name}` },
      geometry: { type: 'LineString', coordinates: greatCirclePoints([from.lon, from.lat], [to.lon, to.lat]) },
    });
  }
  return { type: 'FeatureCollection', features };
}
