import type { FetchResult, GeoEvent } from './types';

// airplanes.live community ADS-B feed. Keyless, CORS `*` (verified live
// 2026-07-10). In-view point query (radius ≤ 250 nm), default-off layer.
//
// Honesty note: NO mock fallback — fabricated aircraft positions, even
// labeled SAMPLE, would be worse than an honest OFFLINE badge (same policy
// as overpass.ts).

export const AVIATION_META = {
  id: 'airplanes-live',
  name: 'Aircraft (airplanes.live)',
  license: 'airplanes.live community ADS-B feed · free non-commercial use',
  homepage: 'https://airplanes.live/rest-api-adsb-data-field-descriptions/',
};

interface ApAircraft {
  hex: string;
  flight?: string;
  r?: string;
  t?: string;
  desc?: string;
  alt_baro?: number | string; // number ft, or the literal string "ground"
  gs?: number;
  track?: number;
  squawk?: string;
  lat?: number;
  lon?: number;
}

const EARTH_KM = 6371;
const NM_PER_KM = 0.539957;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

/** Radius (nm) of the circle circumscribing [south, west, north, east] around
 *  its center — the actual query the point+radius API needs to cover the
 *  view, uncapped. Exported so callers can refuse honestly when it exceeds
 *  the API's 250 nm ceiling instead of relying on fetchAircraft's clamp,
 *  which would silently under-cover a too-wide view. */
export function requiredRadiusNm(bbox: [number, number, number, number]): number {
  const [s, w, n, e] = bbox;
  const lat = (s + n) / 2;
  const lon = (w + e) / 2;
  return Math.max(1, Math.ceil(haversineKm(lat, lon, n, e) * NM_PER_KM));
}

/** Aircraft currently inside [south, west, north, east], approximated as the
 *  circumscribed circle around the view center (the API is point+radius),
 *  capped at the API's 250 nm maximum. */
export async function fetchAircraft(bbox: [number, number, number, number], signal?: AbortSignal): Promise<FetchResult> {
  const started = performance.now();
  const [s, w, n, e] = bbox;
  const lat = (s + n) / 2;
  const lon = (w + e) / 2;
  const radiusNm = Math.min(250, requiredRadiusNm(bbox));
  try {
    const res = await fetch(`https://api.airplanes.live/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${radiusNm}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { ac?: ApAircraft[] };
    const now = Date.now();
    const events: GeoEvent[] = [];
    for (const a of json.ac ?? []) {
      if (a.lat == null || a.lon == null) continue;
      const callsign = a.flight?.trim() || undefined;
      events.push({
        id: `airplanes-live:${a.hex}`,
        type: 'aircraft',
        category: 'Aircraft (ADS-B)',
        lon: a.lon,
        lat: a.lat,
        title: callsign ?? a.r ?? a.hex,
        time: now,
        // a position snapshot, not an event: excluded from timeline/playback/signals
        reference: true,
        sourceId: AVIATION_META.id,
        props: {
          callsign, registration: a.r, aircraftType: a.t, desc: a.desc,
          altitudeFt: a.alt_baro, speedKt: a.gs, track: a.track, squawk: a.squawk,
        },
      });
    }
    return { events, mode: 'live', latencyMs: Math.round(performance.now() - started), error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { events: [], mode: 'offline', latencyMs: Math.round(performance.now() - started), error: err instanceof Error ? err.message : 'fetch failed' };
  }
}
