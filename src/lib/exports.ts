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
