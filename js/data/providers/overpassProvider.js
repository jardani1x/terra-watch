// ============================================================
//  overpassProvider.js — civilian infrastructure search (OSM Overpass)
//  Keyless, CORS-open public API. Queries OpenStreetMap for civilian
//  situational-awareness assets (hospitals, fuel, airfields, …) inside a bbox.
//  Civilian only — NO targeting / fire-control semantics. We CORS-verify the
//  endpoint once with a trivial count query; if that fails we never hammer it,
//  falling straight back to deterministic mock points so the UI still works.
// ============================================================

import { fetchJSON } from './http.js';

const ENDPOINT = 'https://overpass-api.de/api/interpreter';

/**
 * Faceted asset categories → OSM tag filters. Each `filters` entry is an OR set
 * of [key,value] pairs used both to BUILD the Overpass query and to CLASSIFY a
 * returned element back into its facet. `color` drives the globe marker tint.
 * @typedef {Object} AssetFacet
 * @property {string} id @property {string} label @property {string} color
 * @property {[string,string][]} filters
 */
/** @type {AssetFacet[]} */
export const ASSET_FACETS = [
  { id: 'hospital', label: 'Hospitals', color: '#ff7a8a', filters: [['amenity', 'hospital'], ['amenity', 'clinic']] },
  { id: 'police',   label: 'Police',    color: '#7ec8ff', filters: [['amenity', 'police']] },
  { id: 'fire',     label: 'Fire',      color: '#ff8a5a', filters: [['amenity', 'fire_station']] },
  { id: 'fuel',     label: 'Fuel',      color: '#ffd166', filters: [['amenity', 'fuel']] },
  { id: 'airfield', label: 'Airfields', color: '#c08bff', filters: [['aeroway', 'aerodrome']] },
  { id: 'harbour',  label: 'Harbours',  color: '#45e0b0', filters: [['leisure', 'marina'], ['harbour', 'yes']] },
  { id: 'power',    label: 'Power',      color: '#ffb347', filters: [['power', 'substation'], ['power', 'plant']] },
  { id: 'water',    label: 'Water',     color: '#7ec8ff', filters: [['man_made', 'water_tower'], ['man_made', 'water_works']] },
];

const byId = Object.fromEntries(ASSET_FACETS.map((f) => [f.id, f]));

// Which facet does a returned element belong to? First matching filter wins.
function facetOf(tags) {
  for (const f of ASSET_FACETS) {
    for (const [k, v] of f.filters) if (tags[k] === v) return f;
  }
  return null;
}

// Build an Overpass QL query for the chosen facets within [s,w,n,e].
function buildQuery(bbox, facetIds) {
  const [s, w, n, e] = bbox.map((x) => x.toFixed(5));
  let body = '';
  for (const id of facetIds) {
    const f = byId[id];
    if (!f) continue;
    for (const [k, v] of f.filters) {
      body += `node["${k}"="${v}"](${s},${w},${n},${e});way["${k}"="${v}"](${s},${w},${n},${e});`;
    }
  }
  return `[out:json][timeout:25];(${body});out center 300;`;
}

function normalize(json) {
  const out = [];
  for (const el of json.elements || []) {
    const lon = el.lon ?? el.center?.lon;
    const lat = el.lat ?? el.center?.lat;
    if (lon == null || lat == null) continue;
    const tags = el.tags || {};
    const f = facetOf(tags);
    if (!f) continue;
    out.push(asset(`${el.type}-${el.id}`, el.type, el.id, f, lon, lat,
      tags.name || `${f.label} (unnamed)`,
      tags.amenity || tags.aeroway || tags.power || tags.man_made || tags.leisure || tags.harbour || ''));
  }
  return out;
}

// Normalized asset record consumed by search.js + the dashboard.
function asset(id, osmType, osmId, f, lon, lat, label, kind) {
  return { id, osmType, osmId, lon, lat, label, kind,
    facet: f.id, facetLabel: f.label, color: f.color };
}

// One-time CORS / reachability probe. Cached so a dead endpoint isn't re-hit.
let corsOk = null;
export async function verifyOverpass() {
  if (corsOk !== null) return corsOk;
  try {
    await fetchJSON(ENDPOINT + '?data=' + encodeURIComponent('[out:json][timeout:5];out count;'), 6000);
    corsOk = true;
  } catch (_) {
    corsOk = false;
  }
  return corsOk;
}

/**
 * Search civilian assets in a bbox.
 * @param {[number,number,number,number]} bbox [south, west, north, east]
 * @param {string[]} [facetIds] facets to include (default: all)
 * @returns {Promise<{data:Object[], mock:boolean, source:string}>}
 */
export async function searchAssets(bbox, facetIds) {
  const ids = facetIds && facetIds.length ? facetIds : ASSET_FACETS.map((f) => f.id);
  if (await verifyOverpass()) {
    try {
      const json = await fetchJSON(ENDPOINT + '?data=' + encodeURIComponent(buildQuery(bbox, ids)), 25000);
      return { data: normalize(json), mock: false, source: 'OSM Overpass' };
    } catch (_) {
      /* real query failed (timeout / throttle) → mock */
    }
  }
  return { data: mockAssets(bbox, ids), mock: true, source: 'Mock Assets' };
}

// Deterministic mock points scattered inside the bbox, a few per facet.
function mockAssets(bbox, facetIds) {
  const [s, w, n, e] = bbox;
  const cy = (s + n) / 2, cx = (w + e) / 2, hy = (n - s) / 2, hx = (e - w) / 2;
  let seed = Math.floor((cx + cy) * 1000) || 1;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const out = [];
  for (const id of facetIds) {
    const f = byId[id];
    if (!f) continue;
    const k = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < k; i++) {
      const lat = cy + (rnd() * 2 - 1) * hy * 0.8;
      const lon = cx + (rnd() * 2 - 1) * hx * 0.8;
      out.push(asset(`mock-${id}-${i}`, 'node', 0, f, lon, lat, `${f.label} ${i + 1} (mock)`, f.id));
    }
  }
  return out;
}
