import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import type { GeoEvent } from './providers/types';

/** Properties kept from Natural Earth 50m admin-0 (vendored, public domain).
 *  50m (not 110m) because 110m omits microstates entirely — Singapore and
 *  Monaco simply weren't in the dataset, so clicking them selected the
 *  neighbor. Coordinates are rounded to 4 decimals (~11 m) to keep the
 *  vendored file small.
 *  POP/GDP carry their own vintage years — always shown with the value. */
export interface CountryProps {
  NAME: string;
  NAME_LONG: string;
  ISO_A2_EH: string;
  ISO_A3_EH: string;
  ADM0_ISO: string;
  POP_EST: number;
  POP_YEAR: number;
  GDP_MD: number;
  GDP_YEAR: number;
  ECONOMY: string;
  INCOME_GRP: string;
  CONTINENT: string;
  REGION_UN: string;
  SUBREGION: string;
  LABEL_X: number;
  LABEL_Y: number;
}

export type CountryFeature = Feature<Polygon | MultiPolygon, CountryProps>;

export const COUNTRIES_META = {
  id: 'naturalearth',
  name: 'Natural Earth',
  license: 'Public domain (Natural Earth 50m, vendored)',
  homepage: 'https://www.naturalearthdata.com/',
};

let countriesCache: FeatureCollection<Polygon | MultiPolygon, CountryProps> | null = null;
let capitalsCache: Record<string, string> | null = null;

/** Load the vendored country boundaries (fetched once from our own origin —
 *  no third-party network dependency, works offline once the app is cached). */
export async function loadCountries(): Promise<FeatureCollection<Polygon | MultiPolygon, CountryProps>> {
  if (countriesCache) return countriesCache;
  const res = await fetch(`${import.meta.env.BASE_URL}data/ne_countries_50m.json`);
  if (!res.ok) throw new Error(`countries dataset: HTTP ${res.status}`);
  countriesCache = (await res.json()) as FeatureCollection<Polygon | MultiPolygon, CountryProps>;
  return countriesCache;
}

/** adm0_a3 → capital-city name (Natural Earth populated places, vendored). */
export async function loadCapitals(): Promise<Record<string, string>> {
  if (capitalsCache) return capitalsCache;
  const res = await fetch(`${import.meta.env.BASE_URL}data/ne_capitals.json`);
  if (!res.ok) throw new Error(`capitals dataset: HTTP ${res.status}`);
  capitalsCache = (await res.json()) as Record<string, string>;
  return capitalsCache;
}

/** Ray-casting point-in-ring test. */
function inRing(lon: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lon: number, lat: number, poly: Position[][]): boolean {
  if (poly.length === 0 || !inRing(lon, lat, poly[0])) return false;
  // holes: inside an interior ring means outside the polygon
  for (let i = 1; i < poly.length; i++) if (inRing(lon, lat, poly[i])) return false;
  return true;
}

/** True if the point falls inside the country's (50m-resolution) borders.
 *  Offshore events (e.g. sea quakes) won't attribute — by design, not a bug. */
export function pointInCountry(lon: number, lat: number, c: CountryFeature): boolean {
  const g = c.geometry;
  if (g.type === 'Polygon') return inPolygon(lon, lat, g.coordinates);
  return g.coordinates.some((poly) => inPolygon(lon, lat, poly));
}

/** Current-feed events inside the country's borders, newest first. */
export function eventsInCountry(events: GeoEvent[], c: CountryFeature): GeoEvent[] {
  return events.filter((e) => pointInCountry(e.lon, e.lat, c)).sort((a, b) => b.time - a.time);
}

/** Bridge a country into the event-shaped workspaces (graph, dossier).
 *  It is reference data, not an event: type 'country', time = now, positioned
 *  at the Natural Earth label point, attributed to the vendored dataset. */
export function countryAsEvent(c: CountryFeature): GeoEvent {
  const p = c.properties;
  return {
    // NAME, not ADM0_ISO: ISO codes are not unique in Natural Earth (Kosovo
    // shares SRB with Serbia) and a shared id would merge distinct countries
    // in the graph/dossier workspaces
    id: `country:${p.NAME}`,
    type: 'country',
    category: 'Country (reference)',
    lon: p.LABEL_X,
    lat: p.LABEL_Y,
    title: p.NAME,
    time: Date.now(),
    sourceId: COUNTRIES_META.id,
    props: {
      continent: p.CONTINENT,
      subregion: p.SUBREGION,
      population: p.POP_EST,
      populationYear: p.POP_YEAR,
      gdpUsdMillions: p.GDP_MD,
      gdpYear: p.GDP_YEAR,
      incomeGroup: p.INCOME_GRP,
    },
    url: COUNTRIES_META.homepage,
  };
}

/** Match a free-text country name (as carried by e.g. GDACS `props.country`)
 *  to its vendored Natural Earth feature, case-insensitively against both the
 *  short and long name. Returns null if nothing matches (e.g. a name that
 *  doesn't correspond 1:1 to a country, or a multi-country GDACS listing). */
export function findCountryByName(countries: CountryFeature[], name: string): CountryFeature | null {
  const needle = name.toLowerCase();
  return countries.find(
    (c) => c.properties.NAME.toLowerCase() === needle || c.properties.NAME_LONG.toLowerCase() === needle,
  ) ?? null;
}

interface CountryBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** longitude extent, antimeridian-aware: countries crossing ±180°
   *  (Russia, Fiji, NZ) measure their true width, not the whole world */
  lonSpan: number;
}

const boundsCache = new WeakMap<CountryFeature, CountryBounds>();

function countryBounds(c: CountryFeature): CountryBounds {
  const cached = boundsCache.get(c);
  if (cached) return cached;
  let minX = 180, maxX = -180, minY = 90, maxY = -90;
  // unwrapped copy ([0, 360) longitudes) so antimeridian crossers measure true width
  let minU = 360, maxU = 0;
  const scan = (ring: Position[]) => {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const u = x < 0 ? x + 360 : x;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
    }
  };
  const g = c.geometry;
  if (g.type === 'Polygon') g.coordinates.forEach(scan);
  else g.coordinates.forEach((poly) => poly.forEach(scan));
  const b = { minX, maxX, minY, maxY, lonSpan: Math.min(maxX - minX, maxU - minU) };
  boundsCache.set(c, b);
  return b;
}

/** Smallest country whose full-resolution geometry contains the point.
 *  Selection must not trust rendered-feature hit-testing: at low zoom, tile
 *  simplification can swallow a tiny country so a click on Singapore reports
 *  Malaysia. Smallest bbox area wins so microstates beat any larger
 *  neighbor whose bbox overlaps them.
 *
 *  `tolerance` (degrees — pass the current zoom's pixel slop) rescues
 *  microstates that are physically unclickable: a country whose whole bbox is
 *  smaller than ~2 tolerances cannot be aimed at, so a click landing within
 *  one tolerance of its bbox selects it even though the point itself falls in
 *  the big neighbor. At high zoom tolerance shrinks toward 0 and exact
 *  containment always wins. */
export function countryAtPoint(
  countries: CountryFeature[],
  lon: number,
  lat: number,
  tolerance = 0,
): CountryFeature | null {
  // normalize a wrapped-map longitude into the data's [-180, 180] range
  const x = ((lon + 540) % 360) - 180;
  let best: CountryFeature | null = null;
  let bestArea = Infinity;
  for (const c of countries) {
    const b = countryBounds(c);
    const contains =
      lat >= b.minY && lat <= b.maxY &&
      x >= b.minX && x <= b.maxX &&
      pointInCountry(x, lat, c);
    // microstate rescue: too small to hit at this zoom, but the click landed
    // right next to it — the near-miss beats the neighbor containing the point
    const tiny = b.lonSpan <= tolerance * 2 && b.maxY - b.minY <= tolerance * 2;
    const near = !contains && tiny &&
      lat >= b.minY - tolerance && lat <= b.maxY + tolerance &&
      x >= b.minX - tolerance && x <= b.maxX + tolerance;
    if (!contains && !near) continue;
    const area = b.lonSpan * (b.maxY - b.minY);
    if (area < bestArea) { best = c; bestArea = area; }
  }
  return best;
}

/** Rough zoom that frames a country from its geometry bbox. */
export function countryZoom(c: CountryFeature): number {
  const b = countryBounds(c);
  const span = Math.max(b.lonSpan, (b.maxY - b.minY) * 1.6, 0.5);
  return Math.max(1.4, Math.min(6, Math.log2(360 / span)));
}

/** The capitals file is keyed by Natural Earth adm0_a3, which the country
 *  features don't carry — and neither of their ISO fields is a clean match
 *  (ADM0_ISO is shared across e.g. Serbia/Kosovo; ISO_A3_EH is -99 for
 *  disputed territories). Try ADM0_ISO then ISO_A3_EH, with explicit
 *  overrides where either would resolve to a neighbor's capital. Returns
 *  undefined when no honest answer exists. */
const CAPITAL_KEY_OVERRIDES: Record<string, string> = {
  Kosovo: 'KOS',
  Somaliland: 'SOL',
  'W. Sahara': 'SAH',
  // ADM0_ISO would borrow the parent country's capital — suppress instead
  'N. Cyprus': '___',
  'Indian Ocean Ter.': '___',
  'Ashmore and Cartier Is.': '___',
};

export function capitalFor(capitals: Record<string, string>, p: CountryProps): string | undefined {
  const override = CAPITAL_KEY_OVERRIDES[p.NAME];
  if (override) return capitals[override];
  return capitals[p.ADM0_ISO] ?? capitals[p.ISO_A3_EH];
}
