import type { FetchResult, GeoEvent } from './types';

// OSM Overpass military-installation query (Phase 2A Slice 5). Keyless,
// CORS-open public API over OpenStreetMap data — the same public map data
// anyone sees on osm.org. In-view bbox query, default-off layer.
//
// Honesty note: unlike the live event providers there is NO mock fallback
// here — fabricated military-base points, even labeled SAMPLE, would be
// worse than an honest OFFLINE badge. Failure returns empty + offline.

export const OSM_MILITARY_META = {
  id: 'osm-military',
  name: 'Military bases (OSM Overpass)',
  license: '© OpenStreetMap contributors, ODbL 1.0 · Overpass API (overpass-api.de)',
  homepage: 'https://wiki.openstreetmap.org/wiki/Key:military',
};

// OR-set of tag filters — installations, not tactical clutter (no bunkers,
// checkpoints, trenches).
const TAG_FILTERS: [string, string][] = [
  ['landuse', 'military'],
  ['military', 'base'],
  ['military', 'naval_base'],
  ['military', 'airfield'],
  ['military', 'barracks'],
];

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function buildQuery(bbox: [number, number, number, number]): string {
  const [s, w, n, e] = bbox.map((x) => x.toFixed(5));
  let body = '';
  for (const [k, v] of TAG_FILTERS) {
    body += `node["${k}"="${v}"](${s},${w},${n},${e});way["${k}"="${v}"](${s},${w},${n},${e});`;
  }
  return `[out:json][timeout:25];(${body});out center 300;`;
}

/** Query military installations inside [south, west, north, east]. */
export async function fetchMilitaryBases(bbox: [number, number, number, number], signal?: AbortSignal): Promise<FetchResult> {
  const started = performance.now();
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(buildQuery(bbox)), { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { elements?: OverpassElement[] };
    const now = Date.now();
    const seen = new Set<string>();
    const events: GeoEvent[] = [];
    for (const el of json.elements ?? []) {
      const lon = el.lon ?? el.center?.lon;
      const lat = el.lat ?? el.center?.lat;
      if (lon == null || lat == null) continue;
      const id = `osm-military:${el.type}-${el.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const tags = el.tags ?? {};
      events.push({
        id,
        type: 'military-base',
        category: 'Military installation (OSM)',
        lon,
        lat,
        title: tags.name ?? 'Military area (unnamed)',
        time: now,
        reference: true,
        sourceId: OSM_MILITARY_META.id,
        props: { osm: `${el.type}/${el.id}`, tag: tags.military ?? tags.landuse ?? '' },
      });
    }
    return { events, mode: 'live', latencyMs: Math.round(performance.now() - started), error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    const message = err instanceof Error ? err.message : 'fetch failed';
    return { events: [], mode: 'offline', latencyMs: Math.round(performance.now() - started), error: message };
  }
}
