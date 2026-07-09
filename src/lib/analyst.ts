import type { GeoEvent } from './providers/types';
import type { Dossier } from './dossier';
import type { CountryRisk } from './risk';
import { CHOKEPOINTS, nearbyEvents } from './chokepoints';
import type { Monitor } from '../state/store';
import { matchMonitor } from './monitors';

// ---- AI analyst (Slice 9) ----
// Always-on local-rules brief (zero network, zero config) with an optional
// BYO-key LLM tier. The mode shown is always real, mirroring the provider
// adapters' FetchResult.error convention — an LLM failure never gets
// silently hidden behind a fake "AI" answer.

export type AnalystProvider = 'anthropic' | 'openai-compatible';

export interface AnalystCitation {
  label: string;
  url?: string;
}

export interface AnalystMessage {
  role: 'user' | 'assistant';
  text: string;
  citations: AnalystCitation[];
  mode: 'local-rules' | 'llm';
  error?: string;
}

export interface AnalystSettings {
  provider: AnalystProvider | null;
  apiKey: string | null;
  baseUrl: string | null;
}

export interface AnalystContext {
  events: GeoEvent[];
  dossier: Dossier;
  risks: CountryRisk[];
  monitors: Monitor[];
}

/** Keyword refusal, checked locally before any network call — a request
 *  matching a permanently-excluded category (see CLAUDE.md /
 *  PRIVACY_AND_CIVILIAN_USE.md) is refused for free, every time. */
const REFUSAL_PATTERNS: RegExp[] = [
  /\btarget(ing)?\b.*\b(strike|missile|weapon|drone)\b/i,
  /\b(weapon|missile|drone)\b.*\btarget/i,
  /\btask(ing)?\b.*\b(strike|weapon|missile)\b/i,
  /\btrack\b.*\b(person|individual|him|her|this (guy|man|woman|person))\b/i,
  /\bpattern.of.life\b/i,
  /\bwhere (is|does)\b.*\blive\b/i,
  /\bhome address\b/i,
  /\bdox(x)?\b/i,
  /\bwatchlist\b/i,
  /\bfacial recognition\b|\bface.rec\b|\bbiometric/i,
  /\bpredictive polic/i,
  /\bclassified\b.*\b(military|intelligence|source)\b/i,
];

export function isDisallowedQuery(q: string): boolean {
  return REFUSAL_PATTERNS.some((re) => re.test(q));
}

const REFUSAL_TEXT =
  'Terra Watch is a civilian OSINT tool and cannot help with targeting, ' +
  'individual surveillance/pattern-of-life, doxxing, watchlists, biometrics, ' +
  'or predictive policing. See docs/PRIVACY_AND_CIVILIAN_USE.md for the full ' +
  'policy.';

const MAX_CONTEXT_EVENTS = 40;

/** Compact, cited digest of the current live picture — the only material the
 *  LLM (or the local rules) is allowed to draw on. */
export function buildContext(events: GeoEvent[], dossier: Dossier, risks: CountryRisk[]): AnalystContext {
  return {
    events: [...events].sort((a, b) => b.time - a.time).slice(0, MAX_CONTEXT_EVENTS),
    dossier,
    risks,
    monitors: [],
  };
}

function citationForEvent(e: GeoEvent): AnalystCitation {
  return { label: `${e.title} (${e.sourceId})`, url: e.url };
}

/** Deterministic, zero-network summary — the always-on fallback. Reuses the
 *  same aggregation as CountryRiskPanel/RouteExplorerPanel so the numbers
 *  match what's shown elsewhere in the UI. */
export function buildLocalBrief(ctx: AnalystContext, monitors: Monitor[]): AnalystMessage {
  const { events, risks } = ctx;
  const byCategory = new Map<string, number>();
  for (const e of events) {
    const key = e.category ?? e.type;
    byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
  }
  const lines: string[] = [];
  if (events.length === 0) {
    lines.push('No events in the current view.');
  } else {
    const catSummary = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', ');
    lines.push(`${events.length} recent public events in view: ${catSummary}.`);
  }
  if (risks.length > 0) {
    const top = risks.slice(0, 3).map((r) => `${r.country} (weight ${r.score})`).join(', ');
    lines.push(`Top country-alert weights (GDACS, itemized): ${top}.`);
  }
  const matched = monitors
    .map((m) => ({ m, hits: events.filter((e) => matchMonitor(e, [m])).length }))
    .filter((x) => x.hits > 0);
  if (matched.length > 0) {
    lines.push(`Active monitors with hits: ${matched.map((x) => `"${x.m.term}" (${x.hits})`).join(', ')}.`);
  }
  const nearChokepoints = CHOKEPOINTS.map((cp) => ({ cp, n: nearbyEvents(cp, events).length })).filter((x) => x.n > 0);
  if (nearChokepoints.length > 0) {
    lines.push(`Chokepoints with nearby activity: ${nearChokepoints.map((x) => `${x.cp.name} (${x.n})`).join(', ')}.`);
  }
  if (ctx.dossier.items.length > 0) {
    lines.push(`Dossier has ${ctx.dossier.items.length} pinned item(s).`);
  }
  lines.push('This is a rule-based count over the current public feed, not a forecast or a model-generated claim.');

  const citations = events.slice(0, 8).map(citationForEvent);
  return { role: 'assistant', text: lines.join(' '), citations, mode: 'local-rules' };
}

const SYSTEM_PROMPT = `You are Terra Watch's optional AI analyst for a civilian OSINT dashboard.
Rules, no exceptions:
1. Only reference facts present in the CONTEXT block below. Do not invent events, locations, or figures.
2. Every claim must cite a source from CONTEXT by title.
3. Always state clearly that your answer is AI-generated inference, not verified fact, and should be independently verified before acting on it.
4. Refuse any request involving: military/weapon targeting or tasking, surveillance or pattern-of-life analysis of a named individual, doxxing, watchlists, biometrics/facial recognition, predictive policing, or real classified data. This app is civilian-only.
5. Never make claims about named private individuals.
Keep answers concise (under 150 words).`;

function contextBlock(ctx: AnalystContext): string {
  const events = ctx.events.map((e) => `- ${e.title} | ${e.category ?? e.type} | ${new Date(e.time).toISOString()} | ${e.lat.toFixed(2)},${e.lon.toFixed(2)} | source: ${e.sourceId}${e.url ? ` | ${e.url}` : ''}`);
  const risks = ctx.risks.slice(0, 10).map((r) => `- ${r.country}: alert weight ${r.score} (${r.components.length} GDACS alerts)`);
  return [
    'EVENTS:',
    events.length ? events.join('\n') : '(none in current view)',
    'COUNTRY ALERT WEIGHTS:',
    risks.length ? risks.join('\n') : '(none)',
  ].join('\n');
}

async function askAnthropic(question: string, ctx: AnalystContext, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `CONTEXT:\n${contextBlock(ctx)}\n\nQUESTION: ${question}` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Anthropic API returned an unexpected response shape');
  return text;
}

async function askOpenAiCompatible(question: string, ctx: AnalystContext, apiKey: string, baseUrl: string | null): Promise<string> {
  const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `CONTEXT:\n${contextBlock(ctx)}\n\nQUESTION: ${question}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI-compatible API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('OpenAI-compatible API returned an unexpected response shape');
  return text;
}

/** Orchestrator: local refusal check → local brief with no key → LLM with a
 *  key, falling back to the local brief (with the real error attached) on
 *  any network/HTTP/CORS failure. Mode shown is always real. */
export async function askAnalyst(question: string, settings: AnalystSettings, ctx: AnalystContext, monitors: Monitor[]): Promise<AnalystMessage> {
  if (isDisallowedQuery(question)) {
    return { role: 'assistant', text: REFUSAL_TEXT, citations: [], mode: 'local-rules' };
  }
  if (!settings.provider || !settings.apiKey) {
    return buildLocalBrief(ctx, monitors);
  }
  try {
    const text = settings.provider === 'anthropic'
      ? await askAnthropic(question, ctx, settings.apiKey)
      : await askOpenAiCompatible(question, ctx, settings.apiKey, settings.baseUrl);
    const citations = ctx.events.slice(0, 8).map(citationForEvent);
    return { role: 'assistant', text, citations, mode: 'llm' };
  } catch (err) {
    const fallback = buildLocalBrief(ctx, monitors);
    const message = err instanceof Error ? err.message : String(err);
    return { ...fallback, error: `LLM call failed, showing local rules instead: ${message}` };
  }
}
