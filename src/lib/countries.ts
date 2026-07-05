import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import type { GeoEvent } from './providers/types';

/** Properties kept from Natural Earth 110m admin-0 (vendored, public domain).
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
  license: 'Public domain (Natural Earth 110m, vendored)',
  homepage: 'https://www.naturalearthdata.com/',
};

let countriesCache: FeatureCollection<Polygon | MultiPolygon, CountryProps> | null = null;
let capitalsCache: Record<string, string> | null = null;

/** Load the vendored country boundaries (fetched once from our own origin —
 *  no third-party network dependency, works offline once the app is cached). */
export async function loadCountries(): Promise<FeatureCollection<Polygon | MultiPolygon, CountryProps>> {
  if (countriesCache) return countriesCache;
  const res = await fetch(`${import.meta.env.BASE_URL}data/ne_countries_110m.json`);
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

/** True if the point falls inside the country's (110m-resolution) borders.
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
    id: `country:${p.ADM0_ISO}`,
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

/** Rough zoom that frames a country from its geometry bbox. */
export function countryZoom(c: CountryFeature): number {
  let minX = 180, maxX = -180, minY = 90, maxY = -90;
  const scan = (ring: Position[]) => {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  };
  const g = c.geometry;
  if (g.type === 'Polygon') g.coordinates.forEach(scan);
  else g.coordinates.forEach((poly) => poly.forEach(scan));
  const span = Math.max(maxX - minX, (maxY - minY) * 1.6, 0.5);
  return Math.max(1.4, Math.min(6, Math.log2(360 / span)));
}
