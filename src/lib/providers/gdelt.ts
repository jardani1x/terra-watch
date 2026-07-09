import type { DataMode } from './types';

// GDELT DOC 2.0 — keyless, CORS-open JSON article search over global news.
// https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
const BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';

export const GDELT_META = {
  id: 'gdelt',
  name: 'GDELT news',
  license: 'GDELT open data',
  homepage: 'https://www.gdeltproject.org/',
};

export interface NewsArticle {
  title: string;
  url: string;
  domain: string;
  /** GDELT seendate, e.g. "20260709T123000Z" */
  seendate: string;
}

/** Region tab → GDELT query. Keyword queries are tunable; each is scoped to
 *  English-language sources by the fetcher. */
export const REGION_QUERIES: Record<string, string> = {
  'World': '(domain:reuters.com OR domain:apnews.com OR domain:bbc.com OR domain:france24.com)',
  'United States': '("united states" OR washington OR congress OR "white house")',
  'Europe': '(europe OR "european union" OR brussels OR ukraine)',
  'Middle East': '("middle east" OR israel OR iran OR gaza OR "saudi arabia")',
  'Africa': '(africa OR nigeria OR sahel OR ethiopia OR sudan)',
  'Latin America': '("latin america" OR brazil OR mexico OR argentina OR venezuela)',
  'Asia-Pacific': '(china OR japan OR taiwan OR korea OR indonesia OR australia)',
};

/** Clearly-labelled MOCK sample for offline fallback (mode: 'mock'). */
const MOCK: NewsArticle[] = [
  { title: '[SAMPLE] Global markets steady as central banks hold rates', url: 'https://example.org/1', domain: 'sample data (offline)', seendate: '20260709T000000Z' },
  { title: '[SAMPLE] Regional summit concludes with joint statement', url: 'https://example.org/2', domain: 'sample data (offline)', seendate: '20260709T000000Z' },
];

interface GdeltJson { articles?: { title: string; url: string; domain: string; seendate: string }[] }

export async function fetchGdeltNews(query: string, signal?: AbortSignal): Promise<{ articles: NewsArticle[]; mode: DataMode; latencyMs: number; error: string | null }> {
  const started = performance.now();
  try {
    const q = `${query} sourcelang:eng`;
    const url = `${BASE}?query=${encodeURIComponent(q)}&mode=ArtList&format=json&maxrecords=15&timespan=1d`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as GdeltJson;
    const articles = (j.articles ?? []).map((a) => ({ title: a.title, url: a.url, domain: a.domain, seendate: a.seendate }));
    const latencyMs = Math.round(performance.now() - started);
    if (articles.length === 0) return { articles: MOCK, mode: 'mock', latencyMs, error: 'no results' };
    return { articles, mode: 'live', latencyMs, error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { articles: MOCK, mode: 'mock', latencyMs: Math.round(performance.now() - started), error: err instanceof Error ? err.message : 'fetch failed' };
  }
}
