import type { FetchResult, GeoEvent } from './types';

// Vendored open civilian registries (own-origin static JSON, no third-party
// network dependency — matches the "Infrastructure panel: open registries"
// gap). Reference data, not live events: `time` is the fetch time (neither
// source carries a real timestamp), so every event is flagged `reference`
// and time-based views (timeline, playback, signals) skip them.

export const POWER_PLANTS_META = {
  id: 'power-plants',
  name: 'Nuclear Power Plants (WRI)',
  license: 'WRI Global Power Plant Database v1.3.0, CC BY 4.0 (2021 vintage — reference only)',
  homepage: 'https://datasets.wri.org/dataset/globalpowerplantdatabase',
};

export const LAUNCH_SITES_META = {
  id: 'launch-sites',
  name: 'Space Launch Sites (GCAT)',
  license: 'GCAT (J. McDowell, planet4589.org), CC-BY',
  homepage: 'https://planet4589.org/space/gcat/',
};

interface PowerPlantsFile {
  plants: { name: string; country: string; mw: number; lat: number; lon: number }[];
}
interface LaunchSitesFile {
  sites: { name: string; code: string; state: string; lon: number; lat: number }[];
}

export async function fetchPowerPlants(signal?: AbortSignal): Promise<FetchResult> {
  const started = performance.now();
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/nuclear_plants.json`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as PowerPlantsFile;
    const now = Date.now();
    const events: GeoEvent[] = json.plants.map((p, i) => ({
      id: `power-plant:${i}:${p.name}`,
      type: 'nuclear-plant',
      category: 'Nuclear power plant',
      lon: p.lon,
      lat: p.lat,
      title: p.name,
      time: now,
      reference: true,
      sourceId: POWER_PLANTS_META.id,
      props: { country: p.country, megawatts: p.mw },
    }));
    return { events, mode: 'cache', latencyMs: Math.round(performance.now() - started), error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    const message = err instanceof Error ? err.message : 'fetch failed';
    return { events: [], mode: 'offline', latencyMs: Math.round(performance.now() - started), error: message };
  }
}

export async function fetchLaunchSites(signal?: AbortSignal): Promise<FetchResult> {
  const started = performance.now();
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/gcat_launch_sites.json`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as LaunchSitesFile;
    const now = Date.now();
    const events: GeoEvent[] = json.sites.map((s) => ({
      id: `launch-site:${s.code}`,
      type: 'launch-site',
      category: 'Space launch site',
      lon: s.lon,
      lat: s.lat,
      title: s.name && s.name !== '-' ? s.name : s.code,
      time: now,
      reference: true,
      sourceId: LAUNCH_SITES_META.id,
      props: { code: s.code, country: s.state },
    }));
    return { events, mode: 'cache', latencyMs: Math.round(performance.now() - started), error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    const message = err instanceof Error ? err.message : 'fetch failed';
    return { events: [], mode: 'offline', latencyMs: Math.round(performance.now() - started), error: message };
  }
}
