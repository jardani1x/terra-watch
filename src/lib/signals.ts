import type { GeoEvent } from './providers/types';

/** A co-location signal: multiple distinct public event types inside one
 *  1°×1° cell within the rolling feed window. This is a transparent count —
 *  labeled INFERENCE in the UI, every contributing event is citable, and it
 *  makes no prediction. Operates on public geo-events only. */
export interface Signal {
  id: string;
  /** cell center */
  lat: number;
  lon: number;
  types: string[];
  count: number;
  events: GeoEvent[];
}

export function computeSignals(events: GeoEvent[], minTypes = 2): Signal[] {
  const cells = new Map<string, GeoEvent[]>();
  for (const e of events) {
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue;
    const key = `${Math.floor(e.lat)}:${Math.floor(e.lon)}`;
    (cells.get(key) ?? cells.set(key, []).get(key)!).push(e);
  }
  const signals: Signal[] = [];
  for (const [key, evts] of cells) {
    const types = [...new Set(evts.map((e) => e.type))];
    if (types.length < minTypes) continue;
    const [latF, lonF] = key.split(':').map(Number);
    signals.push({ id: key, lat: latF + 0.5, lon: lonF + 0.5, types, count: evts.length, events: evts });
  }
  return signals.sort((a, b) => b.types.length - a.types.length || b.count - a.count);
}
