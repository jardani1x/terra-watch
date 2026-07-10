import type { FetchResult, GeoEvent } from './types';

// Curated static registries (Phase 2A Slice 3) — own-origin vendored JSON with
// source + retrieved headers, following the infrastructure.ts pattern.
// Reference data, not live events: `time` is fetch time, every event is
// flagged `reference` so time-based views (timeline, playback, signals) skip
// them.

export const ECON_CENTERS_META = {
  id: 'econ-centers',
  name: 'Economic centers (exchanges)',
  license: 'Own-origin registry ported from Terra Watch v1 ontology; public exchange locations',
  homepage: 'https://github.com/jardani1x/terra-watch',
};

export const AI_DATACENTERS_META = {
  id: 'ai-datacenters',
  name: 'AI data centers (public reports)',
  license: 'Hand-curated from public operator announcements and trade press; city-level coordinates',
  homepage: 'https://github.com/jardani1x/terra-watch',
};

export const NUCLEAR_FUEL_META = {
  id: 'nuclear-fuel',
  name: 'Nuclear fuel-cycle sites (IAEA/NTI public reporting)',
  license: 'Public reporting: IAEA safeguards statements, NTI facility profiles, World Nuclear Association',
  homepage: 'https://www.nti.org/education-center/facilities/',
};

interface EconCentersFile {
  centers: { name: string; exchange: string; tz: string; lon: number; lat: number }[];
}
interface AiDatacentersFile {
  sites: { name: string; operator: string; country: string; lon: number; lat: number }[];
}
interface NuclearFuelFile {
  sites: { name: string; country: string; kind: string; lon: number; lat: number }[];
}

async function fetchRegistry<T>(file: string, signal: AbortSignal | undefined, toEvents: (json: T, now: number) => GeoEvent[]): Promise<FetchResult> {
  const started = performance.now();
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as T;
    const events = toEvents(json, Date.now());
    return { events, mode: 'cache', latencyMs: Math.round(performance.now() - started), error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    const message = err instanceof Error ? err.message : 'fetch failed';
    return { events: [], mode: 'offline', latencyMs: Math.round(performance.now() - started), error: message };
  }
}

export function fetchEconCenters(signal?: AbortSignal): Promise<FetchResult> {
  return fetchRegistry<EconCentersFile>('economic_centers.json', signal, (json, now) =>
    json.centers.map((c) => ({
      id: `econ-center:${c.name}`,
      type: 'econ-center',
      category: 'Market center',
      lon: c.lon,
      lat: c.lat,
      title: `${c.name} (${c.exchange})`,
      time: now,
      reference: true,
      sourceId: ECON_CENTERS_META.id,
      props: { exchange: c.exchange, timezone: c.tz },
    })),
  );
}

export function fetchAiDatacenters(signal?: AbortSignal): Promise<FetchResult> {
  return fetchRegistry<AiDatacentersFile>('ai_datacenters.json', signal, (json, now) =>
    json.sites.map((s) => ({
      id: `ai-datacenter:${s.name}`,
      type: 'ai-datacenter',
      category: 'AI data center (public reports)',
      lon: s.lon,
      lat: s.lat,
      title: s.name,
      time: now,
      reference: true,
      sourceId: AI_DATACENTERS_META.id,
      props: { operator: s.operator, country: s.country },
    })),
  );
}

export function fetchNuclearFuelSites(signal?: AbortSignal): Promise<FetchResult> {
  return fetchRegistry<NuclearFuelFile>('nuclear_fuel_sites.json', signal, (json, now) =>
    json.sites.map((s) => ({
      id: `nuclear-fuel:${s.name}`,
      type: 'nuclear-fuel-site',
      category: 'Nuclear fuel-cycle site',
      lon: s.lon,
      lat: s.lat,
      title: s.name,
      time: now,
      reference: true,
      sourceId: NUCLEAR_FUEL_META.id,
      props: { country: s.country, kind: s.kind },
    })),
  );
}
