import type { GeoEvent } from './providers/types';
import type { MarketQuote } from './providers/markets';

// ---- Client-side file export helpers (Slice 8) ----
// Everything is generated in the browser from data already on screen; nothing
// is sent anywhere. Filenames carry a timestamp so repeated exports don't clash.

export function downloadText(filename: string, mime: string, text: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** RFC-4180-style escaping: quote any field containing a comma, quote, or newline. */
export function csvEscape(v: string | number | undefined | null): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number | undefined | null)[][]): string {
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n') + '\n';
}

export function eventsToCsv(events: GeoEvent[]): string {
  return toCsv(
    ['id', 'type', 'category', 'title', 'time_utc', 'lat', 'lon', 'magnitude', 'source', 'url'],
    events.map((e) => [
      e.id, e.type, e.category, e.title, new Date(e.time).toISOString(),
      e.lat, e.lon, e.magnitude, e.sourceId, e.url,
    ]),
  );
}

export function eventsToJson(events: GeoEvent[], now = Date.now()): string {
  return JSON.stringify(
    {
      exportedAt: new Date(now).toISOString(),
      tool: 'Terra Watch (civilian OSINT dashboard)',
      count: events.length,
      events,
    },
    null,
    2,
  );
}

export function quotesToCsv(quotes: MarketQuote[]): string {
  return toCsv(
    ['id', 'label', 'value', 'change_24h_pct', 'source', 'as_of'],
    quotes.map((q) => [q.id, q.label, q.value, q.change24h, q.source, q.asOf]),
  );
}
