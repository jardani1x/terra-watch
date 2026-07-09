import type { GeoEvent } from './providers/types';

function haversineKm(a: GeoEvent, b: GeoEvent): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface RelatedEvent {
  event: GeoEvent;
  label: string;
}

/** "Search around": find public events related to `node` by shared provider/type
 *  and proximity in space + time. A read-only correlation over public geo-events
 *  only (distance/time, no identity data) — never a person/entity surveillance graph. */
export function findRelated(node: GeoEvent, pool: GeoEvent[], excludeIds: Set<string>, max = 6): RelatedEvent[] {
  return pool
    .filter((e) => e.id !== node.id && !excludeIds.has(e.id))
    .map((e) => ({
      event: e,
      km: haversineKm(node, e),
      hrs: Math.abs(e.time - node.time) / 3_600_000,
      sameType: e.type === node.type,
      sameSource: e.sourceId === node.sourceId,
    }))
    .filter((c) => (c.sameType || c.sameSource) && c.km <= 800 && c.hrs <= 72)
    .sort((a, b) => a.km - b.km)
    .slice(0, max)
    .map((c) => {
      const parts: string[] = [];
      if (c.sameType) parts.push('same type');
      if (c.sameSource) parts.push('same source');
      parts.push(`${Math.round(c.km)}km`);
      parts.push(c.hrs < 1 ? '<1h apart' : `${Math.round(c.hrs)}h apart`);
      return { event: c.event, label: parts.join(' · ') };
    });
}
