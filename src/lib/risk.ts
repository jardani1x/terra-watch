import type { GeoEvent } from './providers/types';

/** One country's current-alert weighting. Every point of the score is
 *  itemized in `components` — explainable by construction, never a forecast. */
export interface CountryRisk {
  country: string;
  score: number;
  /** one entry per contributing event, e.g. "Red · Tropical cyclone" */
  components: string[];
  /** distinct hazard categories among contributors */
  types: string[];
  /** mean position of contributing events (for flyTo) */
  lon: number;
  lat: number;
}

/** Transparent weights for GDACS alert levels. */
const LEVEL_WEIGHT: Record<string, number> = { Red: 3, Orange: 2, Green: 1 };

/** Aggregate current country-attributed alerts (GDACS carries `props.country`
 *  + `props.alertLevel`) into an itemized per-country weight. Pure function
 *  over the live feed — recomputed on every refresh, nothing persisted. */
export function computeCountryRisk(events: GeoEvent[]): CountryRisk[] {
  const byCountry = new Map<string, { score: number; components: string[]; types: Set<string>; lon: number; lat: number; n: number }>();
  for (const e of events) {
    const country = typeof e.props.country === 'string' ? e.props.country : null;
    const level = typeof e.props.alertLevel === 'string' ? e.props.alertLevel : null;
    if (!country || !level || !(level in LEVEL_WEIGHT)) continue;
    // multi-country alerts ("A, B") credit the first-listed (primary) country
    const primary = country.split(',')[0].trim();
    const cur = byCountry.get(primary) ?? { score: 0, components: [], types: new Set<string>(), lon: 0, lat: 0, n: 0 };
    cur.score += LEVEL_WEIGHT[level];
    cur.components.push(`${level} · ${e.category ?? e.type}`);
    cur.types.add(e.category ?? e.type);
    cur.lon += e.lon;
    cur.lat += e.lat;
    cur.n += 1;
    byCountry.set(primary, cur);
  }
  return [...byCountry.entries()]
    .map(([country, c]) => ({
      country,
      score: c.score,
      components: c.components,
      types: [...c.types],
      lon: c.lon / c.n,
      lat: c.lat / c.n,
    }))
    .sort((a, b) => b.score - a.score || a.country.localeCompare(b.country));
}
