import type { GeoEvent } from './providers/types';
import type { Monitor } from '../state/store';

/** First monitor whose keyword appears in the event title, if any. */
export function matchMonitor(event: GeoEvent, monitors: Monitor[]): Monitor | undefined {
  if (monitors.length === 0) return undefined;
  const title = event.title.toLowerCase();
  return monitors.find((m) => title.includes(m.term.toLowerCase()));
}
