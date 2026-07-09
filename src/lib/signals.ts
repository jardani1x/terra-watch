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
    // reference registries (plants, launch sites) are places, not events —
    // co-locating them with a live event is not a signal
    if (e.reference) continue;
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

/** DEFCON-style composite alert index, derived transparently from the live
 *  public feeds. NOT the official U.S. DEFCON (which is not public) — the UI
 *  must always badge this DERIVED · UNOFFICIAL. Level 5 = quiet baseline,
 *  1 = extreme. Thresholds are documented inline and every trigger is
 *  itemized in `reasons`. */
export function computeAlertIndex(events: GeoEvent[]): { level: 1 | 2 | 3 | 4 | 5; reasons: string[] } {
  const gdacs = events.filter((e) => e.type === 'disaster-alert');
  const red = gdacs.filter((e) => e.props.alertLevel === 'Red').length;
  const orange = gdacs.filter((e) => e.props.alertLevel === 'Orange').length;
  const maxMag = Math.max(0, ...events.filter((e) => e.type === 'earthquake').map((e) => e.magnitude ?? 0));
  const signalCount = computeSignals(events).length;

  const reasons: string[] = [];
  if (red) reasons.push(`${red} GDACS Red alert${red > 1 ? 's' : ''}`);
  if (orange) reasons.push(`${orange} GDACS Orange alert${orange > 1 ? 's' : ''}`);
  if (maxMag >= 6) reasons.push(`M${maxMag.toFixed(1)} earthquake in window`);
  if (signalCount >= 3) reasons.push(`${signalCount} co-location signals`);

  let level: 1 | 2 | 3 | 4 | 5 = 5;
  if (red >= 5) level = 1;
  else if (red >= 3) level = 2;
  else if (red >= 1 || maxMag >= 7) level = 3;
  else if (orange >= 1 || maxMag >= 6 || signalCount >= 3) level = 4;
  if (reasons.length === 0) reasons.push('No elevated public-feed indicators');
  return { level, reasons };
}
