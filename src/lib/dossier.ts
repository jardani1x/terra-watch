import type { GeoEvent } from './providers/types';

// ---- Dossier / report workspace (Slice 8) ----
// A dossier is a user-curated pin board of public events. Provider attribution
// is frozen onto each item at pin time so exports stay fully cited even if the
// source is later disabled or its health changes. User notes are always
// labeled "user-authored" in exports — commentary is never presented as source
// material.

export interface DossierCitation {
  name: string;
  license: string;
  homepage: string;
}

export interface DossierItem {
  /** same as the pinned event's id */
  id: string;
  event: GeoEvent;
  citation: DossierCitation;
  /** user-authored analyst note; labeled as such wherever it appears */
  note: string;
  /** epoch ms when the event was pinned */
  addedAt: number;
}

export interface Dossier {
  title: string;
  items: DossierItem[];
}

const iso = (ms: number) => new Date(ms).toISOString();

export function dossierMarkdown(dossier: Dossier, now = Date.now()): string {
  const lines: string[] = [
    `# ${dossier.title || 'Terra Watch dossier'}`,
    '',
    `Exported ${iso(now)} · Terra Watch (civilian OSINT dashboard) · ${dossier.items.length} pinned public event${dossier.items.length === 1 ? '' : 's'}.`,
    '',
    'Every item is public open data and carries its source citation. Lines marked',
    '**Analyst note (user-authored)** are commentary written by the person who built',
    'this dossier — they are not source material.',
    '',
  ];
  dossier.items.forEach((it, i) => {
    const e = it.event;
    lines.push(`## ${i + 1}. ${e.title}`, '');
    lines.push(`- **Type:** ${e.category ?? e.type}`);
    lines.push(`- **Observed:** ${iso(e.time)}`);
    lines.push(`- **Location:** ${e.lat.toFixed(4)}, ${e.lon.toFixed(4)}`);
    if (e.magnitude != null) lines.push(`- **Magnitude:** ${e.magnitude}`);
    lines.push(`- **Source:** ${it.citation.name} · ${it.citation.license}`);
    if (e.url) lines.push(`- **Authoritative record:** ${e.url}`);
    else if (it.citation.homepage) lines.push(`- **Provider:** ${it.citation.homepage}`);
    lines.push(`- **Pinned:** ${iso(it.addedAt)}`);
    if (it.note.trim()) lines.push(`- **Analyst note (user-authored):** ${it.note.trim()}`);
    lines.push('');
  });
  return lines.join('\n');
}

export function dossierJson(dossier: Dossier, now = Date.now()): string {
  return JSON.stringify(
    {
      title: dossier.title || 'Terra Watch dossier',
      exportedAt: iso(now),
      tool: 'Terra Watch (civilian OSINT dashboard)',
      noteDisclaimer: 'note fields are user-authored commentary, not source material',
      items: dossier.items.map((it) => ({
        event: it.event,
        citation: it.citation,
        note: it.note,
        pinnedAt: iso(it.addedAt),
      })),
    },
    null,
    2,
  );
}
