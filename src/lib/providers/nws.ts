import type { FetchResult, GeoEvent } from './types';

// NOAA National Weather Service alerts — public, keyless, CORS-enabled.
// US coverage only. Only alerts carrying polygon geometry are mappable
// (zone-referenced alerts without polygons are skipped, not guessed).
// https://www.weather.gov/documentation/services-web-api
const FEED = 'https://api.weather.gov/alerts/active?status=actual';

export const NWS_META = {
  id: 'nws',
  name: 'NOAA NWS Alerts',
  license: 'NOAA / NWS — U.S. Government public domain',
  homepage: 'https://www.weather.gov/documentation/services-web-api',
};

interface NwsFeature {
  geometry: { type: string; coordinates: unknown } | null;
  properties: {
    '@id': string;
    event?: string | null;
    headline?: string | null;
    severity?: string | null;
    urgency?: string | null;
    sent?: string | null;
    expires?: string | null;
    areaDesc?: string | null;
    web?: string | null;
  };
}

/** Centroid of the first ring (Polygon) or first polygon's first ring (MultiPolygon). */
function centroid(geom: { type: string; coordinates: unknown }): [number, number] | null {
  let ring: unknown;
  if (geom.type === 'Polygon') ring = (geom.coordinates as number[][][])[0];
  else if (geom.type === 'MultiPolygon') ring = (geom.coordinates as number[][][][])[0]?.[0];
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let lon = 0;
  let lat = 0;
  for (const pt of ring as [number, number][]) { lon += pt[0]; lat += pt[1]; }
  return [lon / (ring as unknown[]).length, lat / (ring as unknown[]).length];
}

/** Clearly-labelled MOCK sample for offline fallback (mode: 'mock'). */
const MOCK: GeoEvent[] = [
  { id: 'nws-mock-1', type: 'weather-alert', category: 'Severe Thunderstorm Warning', lon: -97.5, lat: 35.5, title: 'Severe Thunderstorm Warning — sample (offline)', time: Date.now() - 1.8e6, sourceId: 'nws', props: { severity: 'Severe', note: 'sample data' } },
  { id: 'nws-mock-2', type: 'weather-alert', category: 'Flood Advisory', lon: -90.1, lat: 29.9, title: 'Flood Advisory — sample (offline)', time: Date.now() - 5.4e6, sourceId: 'nws', props: { severity: 'Minor', note: 'sample data' } },
];

export async function fetchNws(signal?: AbortSignal): Promise<FetchResult> {
  const started = performance.now();
  try {
    const res = await fetch(FEED, { signal, headers: { Accept: 'application/geo+json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { features: NwsFeature[] };
    const events: GeoEvent[] = [];
    for (const f of json.features) {
      if (!f.geometry) continue; // zone-based alert without a polygon — not mappable
      const c = centroid(f.geometry);
      if (!c) continue;
      const p = f.properties;
      events.push({
        id: p['@id'],
        type: 'weather-alert',
        category: p.event ?? 'Weather alert',
        lon: c[0],
        lat: c[1],
        title: `${p.event ?? 'Weather alert'} — ${(p.areaDesc ?? '').split(';')[0]}`,
        time: p.sent ? Date.parse(p.sent) : Date.now(),
        sourceId: 'nws',
        url: p.web ?? p['@id'],
        props: {
          severity: p.severity ?? undefined,
          urgency: p.urgency ?? undefined,
          expires: p.expires ?? undefined,
          area: p.areaDesc ?? undefined,
          note: 'centroid of alert polygon',
        },
      });
    }
    return { events, mode: 'live', latencyMs: Math.round(performance.now() - started), error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    const message = err instanceof Error ? err.message : 'fetch failed';
    return { events: MOCK, mode: 'mock', latencyMs: Math.round(performance.now() - started), error: message };
  }
}
