import type { FetchResult, GeoEvent } from './types';

// NASA EONET v3 — Earth Observatory Natural Event Tracker. Public, keyless.
// Open (currently active) natural events: wildfires, volcanoes, storms, etc.
const FEED = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=200';

export const EONET_META = {
  id: 'eonet',
  name: 'NASA EONET',
  license: 'NASA EONET (public / courtesy NASA Earth Observatory)',
  homepage: 'https://eonet.gsfc.nasa.gov/',
};

interface EonetGeometry {
  date: string;
  type: 'Point' | 'Polygon';
  coordinates: number[] | number[][][];
  magnitudeValue?: number | null;
  magnitudeUnit?: string | null;
}
interface EonetEvent {
  id: string;
  title: string;
  link?: string;
  categories: { id: string; title: string }[];
  sources?: { id: string; url: string }[];
  geometry: EonetGeometry[];
}

/** Reduce a geometry to a representative [lon, lat] (polygon → first vertex). */
function pointOf(g: EonetGeometry): [number, number] | null {
  if (g.type === 'Point') {
    const c = g.coordinates as number[];
    return [c[0], c[1]];
  }
  const ring = (g.coordinates as number[][][])?.[0]?.[0];
  return ring ? [ring[0], ring[1]] : null;
}

const MOCK: GeoEvent[] = [
  { id: 'mock-fire', type: 'wildfires', category: 'Wildfires', lon: -120.5, lat: 38.9, title: 'Sample wildfire (offline)', time: Date.now() - 5.4e6, sourceId: 'eonet', props: { note: 'sample data' } },
  { id: 'mock-volc', type: 'volcanoes', category: 'Volcanoes', lon: 14.99, lat: 37.75, title: 'Sample volcanic activity (offline)', time: Date.now() - 9e6, sourceId: 'eonet', props: { note: 'sample data' } },
];

export async function fetchEonet(signal?: AbortSignal): Promise<FetchResult> {
  const started = performance.now();
  try {
    const res = await fetch(FEED, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { events: EonetEvent[] };
    const events: GeoEvent[] = [];
    for (const ev of json.events) {
      const g = ev.geometry[ev.geometry.length - 1]; // latest observation
      if (!g) continue;
      const pt = pointOf(g);
      if (!pt) continue;
      const cat = ev.categories[0];
      events.push({
        id: ev.id,
        type: cat?.id ?? 'other',
        category: cat?.title ?? 'Natural event',
        lon: pt[0],
        lat: pt[1],
        title: ev.title,
        time: Date.parse(g.date) || Date.now(),
        magnitude: g.magnitudeValue ?? undefined,
        sourceId: 'eonet',
        url: ev.sources?.[0]?.url ?? ev.link,
        props: {
          category: cat?.title,
          magnitude: g.magnitudeValue ?? undefined,
          magnitudeUnit: g.magnitudeUnit ?? undefined,
          observations: ev.geometry.length,
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
