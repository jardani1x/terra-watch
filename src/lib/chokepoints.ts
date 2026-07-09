import type { GeoEvent } from './providers/types';

/** Static reference catalog of maritime chokepoints — public-knowledge
 *  geography, not fetched data. Route Explorer Lite pairs each with a
 *  transparent count of current public events nearby; it is a reference +
 *  count, never a routing service or a disruption prediction. */
export interface Chokepoint {
  id: string;
  name: string;
  region: string;
  lon: number;
  lat: number;
  /** commonly used alternate routing, for reference */
  alternate: string;
}

export const CHOKEPOINTS: Chokepoint[] = [
  { id: 'suez', name: 'Suez Canal', region: 'Egypt · Med–Red Sea', lon: 32.35, lat: 30.45, alternate: 'Cape of Good Hope (≈ +9,600 km)' },
  { id: 'panama', name: 'Panama Canal', region: 'Panama · Atlantic–Pacific', lon: -79.65, lat: 9.08, alternate: 'Strait of Magellan / Cape Horn' },
  { id: 'hormuz', name: 'Strait of Hormuz', region: 'Persian Gulf–Arabian Sea', lon: 56.5, lat: 26.6, alternate: 'limited overland pipelines only' },
  { id: 'malacca', name: 'Strait of Malacca', region: 'SE Asia · Indian–Pacific', lon: 101.0, lat: 2.5, alternate: 'Sunda / Lombok straits' },
  { id: 'bab-el-mandeb', name: 'Bab-el-Mandeb', region: 'Red Sea–Gulf of Aden', lon: 43.4, lat: 12.6, alternate: 'Cape of Good Hope' },
  { id: 'gibraltar', name: 'Strait of Gibraltar', region: 'Atlantic–Mediterranean', lon: -5.6, lat: 35.95, alternate: 'none (sole Med Atlantic access)' },
  { id: 'bosphorus', name: 'Bosphorus', region: 'Türkiye · Black Sea–Med', lon: 29.05, lat: 41.1, alternate: 'none (sole Black Sea access)' },
  { id: 'dover', name: 'Strait of Dover', region: 'Channel–North Sea', lon: 1.45, lat: 51.0, alternate: 'north of Scotland' },
  { id: 'taiwan', name: 'Taiwan Strait', region: 'East Asia container corridor', lon: 119.8, lat: 24.5, alternate: 'east of Taiwan (Philippine Sea)' },
];

export const NEARBY_RADIUS_KM = 500;

function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Transparent count of current feed events within the radius of a chokepoint. */
export function nearbyEvents(cp: Chokepoint, events: GeoEvent[], radiusKm = NEARBY_RADIUS_KM): GeoEvent[] {
  return events.filter((e) => haversineKm(cp.lon, cp.lat, e.lon, e.lat) <= radiusKm);
}
