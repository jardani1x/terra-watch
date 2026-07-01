import type { FetchResult, GeoEvent } from './types';

// USGS Earthquake Hazards Program — public, keyless, no auth. GeoJSON feed of
// M2.5+ events over the past 24h. https://earthquake.usgs.gov/earthquakes/feed/
const FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

export const USGS_META = {
  id: 'usgs',
  name: 'USGS Earthquakes',
  license: 'USGS / public domain (U.S. Geological Survey)',
  homepage: 'https://earthquake.usgs.gov/earthquakes/feed/',
};

interface UsgsFeature {
  id: string;
  properties: { mag: number | null; place: string | null; time: number | null; url: string | null };
  geometry: { coordinates: [number, number, number] } | null;
}

/** A tiny, clearly-labelled sample so the map is never blank offline. This is
 *  MOCK data — the UI must label it as such (mode: 'mock'). */
const MOCK: GeoEvent[] = [
  { id: 'mock-1', type: 'earthquake', lon: 142.37, lat: 38.32, title: 'M6.1 — sample (offline)', time: Date.now() - 3.6e6, magnitude: 6.1, sourceId: 'usgs', props: { note: 'sample data' } },
  { id: 'mock-2', type: 'earthquake', lon: -122.08, lat: 37.42, title: 'M4.2 — sample (offline)', time: Date.now() - 7.2e6, magnitude: 4.2, sourceId: 'usgs', props: { note: 'sample data' } },
  { id: 'mock-3', type: 'earthquake', lon: 25.13, lat: 35.34, title: 'M5.0 — sample (offline)', time: Date.now() - 1.1e7, magnitude: 5.0, sourceId: 'usgs', props: { note: 'sample data' } },
];

export async function fetchUsgs(signal?: AbortSignal): Promise<FetchResult> {
  const started = performance.now();
  try {
    const res = await fetch(FEED, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { features: UsgsFeature[] };
    const events: GeoEvent[] = json.features
      .filter((f) => f.geometry && f.geometry.coordinates)
      .map((f) => {
        const [lon, lat, depth] = f.geometry!.coordinates;
        return {
          id: f.id,
          type: 'earthquake',
          lon,
          lat,
          title: f.properties.place ?? 'Unknown location',
          time: f.properties.time ?? Date.now(),
          magnitude: f.properties.mag ?? undefined,
          sourceId: 'usgs',
          url: f.properties.url ?? undefined,
          props: { magnitude: f.properties.mag ?? undefined, depthKm: depth, place: f.properties.place ?? undefined },
        };
      });
    return { events, mode: 'live', latencyMs: Math.round(performance.now() - started), error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    const message = err instanceof Error ? err.message : 'fetch failed';
    return { events: MOCK, mode: 'mock', latencyMs: Math.round(performance.now() - started), error: message };
  }
}
