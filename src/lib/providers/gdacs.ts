import type { FetchResult, GeoEvent } from './types';

// GDACS (Global Disaster Alert and Coordination System, EC JRC + UN OCHA) —
// public, keyless, CORS `*`. Global multi-hazard alerts (cyclones, floods,
// earthquakes, droughts, wildfires, volcanoes) with Green/Orange/Red levels.
// The MAP feed repeats each event as centroid + polygon + track features;
// only the Point_Centroid feature is ingested (one point per event).
// https://www.gdacs.org/
const FEED = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP';

export const GDACS_META = {
  id: 'gdacs',
  name: 'GDACS Disasters',
  license: 'GDACS — EC Joint Research Centre / UN OCHA, public alert data',
  homepage: 'https://www.gdacs.org/',
};

const HAZARD_NAMES: Record<string, string> = {
  EQ: 'Earthquake',
  TC: 'Tropical cyclone',
  FL: 'Flood',
  DR: 'Drought',
  WF: 'Wildfire',
  VO: 'Volcano',
  TS: 'Tsunami',
};

interface GdacsFeature {
  geometry: { type: string; coordinates: [number, number] };
  properties: {
    Class?: string;
    eventtype: string;
    eventid: number;
    name?: string | null;
    description?: string | null;
    alertlevel?: string | null;
    alertscore?: number | null;
    country?: string | null;
    fromdate?: string | null;
    todate?: string | null;
    datemodified?: string | null;
    source?: string | null;
    severitydata?: { severitytext?: string | null } | null;
    url?: { report?: string | null } | null;
  };
}

/** GDACS timestamps are UTC but carry no zone suffix — parse them as UTC. */
function utcMs(s: string | null | undefined): number | null {
  if (!s) return null;
  const ms = Date.parse(/[Zz]|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** Clearly-labelled MOCK sample for offline fallback (mode: 'mock'). */
const MOCK: GeoEvent[] = [
  { id: 'gdacs-mock-1', type: 'disaster-alert', category: 'Tropical cyclone', lon: 125.2, lat: 13.6, title: 'Tropical cyclone — sample (offline)', time: Date.now() - 2.7e6, sourceId: 'gdacs', props: { alertLevel: 'Orange', note: 'sample data' } },
  { id: 'gdacs-mock-2', type: 'disaster-alert', category: 'Flood', lon: 89.5, lat: 24.8, title: 'Flood — sample (offline)', time: Date.now() - 6.3e6, sourceId: 'gdacs', props: { alertLevel: 'Green', note: 'sample data' } },
];

export async function fetchGdacs(signal?: AbortSignal): Promise<FetchResult> {
  const started = performance.now();
  try {
    const res = await fetch(FEED, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { features: GdacsFeature[] };
    const events: GeoEvent[] = [];
    const seen = new Set<string>();
    for (const f of json.features) {
      // events also appear as polygons / cyclone track lines — take one centroid each
      if (f.geometry?.type !== 'Point' || f.properties.Class !== 'Point_Centroid') continue;
      const p = f.properties;
      const id = `gdacs-${p.eventtype}-${p.eventid}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const hazard = HAZARD_NAMES[p.eventtype] ?? p.eventtype;
      events.push({
        id,
        type: 'disaster-alert',
        category: hazard,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        title: p.name || p.description || `${hazard} — ${p.country ?? 'unknown area'}`,
        time: utcMs(p.datemodified) ?? utcMs(p.fromdate) ?? Date.now(),
        sourceId: 'gdacs',
        url: p.url?.report ?? undefined,
        props: {
          alertLevel: p.alertlevel ?? undefined,
          alertScore: p.alertscore ?? undefined,
          country: p.country ?? undefined,
          severity: p.severitydata?.severitytext?.trim() || undefined,
          from: p.fromdate ?? undefined,
          to: p.todate ?? undefined,
          dataSource: p.source ?? undefined,
          note: 'event centroid (GDACS MAP feed)',
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
