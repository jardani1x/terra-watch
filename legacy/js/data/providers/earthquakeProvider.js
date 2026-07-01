// ============================================================
//  earthquakeProvider.js — real seismic events (USGS)
//  earthquake.usgs.gov GeoJSON summary feeds: CORS-open, no key. We use the
//  "M2.5+ past day" feed for a readable global picture. Normalizes to QuakeEvent.
// ============================================================

import { fetchJSON } from './http.js';

/** @typedef {import('./types.js').QuakeEvent} QuakeEvent */

const FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

/**
 * Recent earthquakes worldwide.
 * @param {number} [max] cap the number returned (largest first)
 * @returns {Promise<QuakeEvent[]>}
 */
export async function fetchQuakes(max = 60) {
  const json = await fetchJSON(FEED, 10000);
  const out = (json.features || []).map((f) => {
    const [lon, lat, depthKm] = f.geometry?.coordinates || [];
    const p = f.properties || {};
    return {
      id: f.id,
      mag: p.mag ?? 0,
      place: p.place || 'Unknown location',
      lon, lat, depthKm: depthKm ?? 0,
      ts: p.time || Date.now(),
      source: 'USGS',
    };
  }).filter((q) => q.lon != null && q.lat != null);
  out.sort((a, b) => b.mag - a.mag);
  return out.slice(0, max);
}
