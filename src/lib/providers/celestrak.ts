import type { DataMode } from './types';

// CelesTrak GP element sets — the standard public source of orbital elements
// (Dr. T.S. Kelso). Keyless, CORS `*` (verified live 2026-07-10; the active
// group was 2.69 MB / 15,985 objects). Fetched once per session on toggle-on;
// TLEs stay useful for days, so there is no periodic re-fetch.
//
// Positions rendered from this data are SGP4 *propagations* — computed
// predictions from the TLE epoch, never observed telemetry. Every surface
// showing them must say so.
//
// Honesty note: NO mock fallback — failure returns empty + offline.

export const CELESTRAK_META = {
  id: 'celestrak',
  name: 'Satellites (CelesTrak)',
  license: 'CelesTrak GP element sets (celestrak.org) · public orbital data',
  homepage: 'https://celestrak.org/NORAD/elements/',
};

export interface TleSet { name: string; l1: string; l2: string }

export interface TleResult { sats: TleSet[]; mode: DataMode; latencyMs: number; error: string | null }

const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';

/** Parse classic 3-line TLE text (name / line 1 / line 2). */
export function parseTles(text: string): TleSet[] {
  const lines = text.split(/\r?\n/);
  const sats: TleSet[] = [];
  for (let i = 0; i + 2 < lines.length; i++) {
    if (lines[i + 1]?.startsWith('1 ') && lines[i + 2]?.startsWith('2 ')) {
      sats.push({ name: lines[i].trim(), l1: lines[i + 1], l2: lines[i + 2] });
      i += 2;
    }
  }
  return sats;
}

export async function fetchTles(signal?: AbortSignal): Promise<TleResult> {
  const started = performance.now();
  try {
    const res = await fetch(TLE_URL, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const sats = parseTles(await res.text());
    if (sats.length === 0) throw new Error('no TLE sets in response');
    return { sats, mode: 'live', latencyMs: Math.round(performance.now() - started), error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { sats: [], mode: 'offline', latencyMs: Math.round(performance.now() - started), error: err instanceof Error ? err.message : 'fetch failed' };
  }
}
