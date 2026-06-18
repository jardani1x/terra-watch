// ============================================================
//  model.js — lightweight ontology (entities + relationships)
//  An original, generic operational data model: typed entities and typed,
//  directed relationships held in memory. Phase 1 uses it to back the inspector
//  ("what is this, and what is it linked to"); a graph VISUALIZATION is Phase 2.
//  No backend, no persistence here — entities are rebuilt from feeds each load.
// ============================================================

/** Entity type tags. */
export const ENTITY = Object.freeze({
  LOCATION: 'Location',
  ASSET: 'Asset',
  EVENT: 'Event',
  MARKET_INSTRUMENT: 'MarketInstrument',
  ALERT: 'Alert',
  FEED_SOURCE: 'FeedSource',
  ROUTE: 'Route',
  OBSERVATION: 'Observation',
});

/** Directed relationship type tags. */
export const RELATION = Object.freeze({
  LOCATED_AT: 'LOCATED_AT',
  IMPACTS: 'IMPACTS',
  RELATED_TO: 'RELATED_TO',
  OBSERVED_FROM: 'OBSERVED_FROM',
  PART_OF: 'PART_OF',
  NEAR: 'NEAR',
});

/**
 * @typedef {Object} Entity
 * @property {string} id
 * @property {string} type  one of ENTITY
 * @property {string} label
 * @property {number} [lon]
 * @property {number} [lat]
 * @property {Object} [props] free-form detail shown in the inspector
 *
 * @typedef {Object} Relation
 * @property {string} from  entity id
 * @property {string} to    entity id
 * @property {string} type  one of RELATION
 */

/** Create an isolated ontology store. */
export function createOntology() {
  /** @type {Map<string, Entity>} */
  const entities = new Map();
  /** @type {Relation[]} */
  const relations = [];

  /** Insert or replace an entity. @returns {Entity} */
  function upsert(entity) {
    entities.set(entity.id, entity);
    return entity;
  }

  /** Add a directed relation (deduplicated). */
  function relate(from, to, type) {
    if (from === to) return;
    if (relations.some((r) => r.from === from && r.to === to && r.type === type)) return;
    relations.push({ from, to, type });
  }

  const get = (id) => entities.get(id) || null;
  const all = () => [...entities.values()];

  /** Entities directly linked to `id` (either direction), with the relation. */
  function neighbors(id) {
    const out = [];
    for (const r of relations) {
      if (r.from === id && entities.has(r.to)) out.push({ entity: entities.get(r.to), type: r.type, dir: 'out' });
      else if (r.to === id && entities.has(r.from)) out.push({ entity: entities.get(r.from), type: r.type, dir: 'in' });
    }
    return out;
  }

  /** Drop everything (used when watchlist / feeds are cleared). */
  function clear() { entities.clear(); relations.length = 0; }

  return { ENTITY, RELATION, upsert, relate, get, all, neighbors, clear,
    get size() { return entities.size; }, relations };
}

/**
 * Major global market centers — the seed Location/Asset entities for the
 * "market centers" map layer. tz is an IANA zone for the open/closed readout.
 */
export const MARKET_CENTERS = [
  { id: 'mc-ny', name: 'New York', lon: -74.006, lat: 40.713, tz: 'America/New_York', exch: 'NYSE / Nasdaq' },
  { id: 'mc-ldn', name: 'London', lon: -0.1276, lat: 51.507, tz: 'Europe/London', exch: 'LSE' },
  { id: 'mc-fra', name: 'Frankfurt', lon: 8.6821, lat: 50.110, tz: 'Europe/Berlin', exch: 'Deutsche Börse' },
  { id: 'mc-tyo', name: 'Tokyo', lon: 139.692, lat: 35.690, tz: 'Asia/Tokyo', exch: 'JPX' },
  { id: 'mc-hkg', name: 'Hong Kong', lon: 114.169, lat: 22.319, tz: 'Asia/Hong_Kong', exch: 'HKEX' },
  { id: 'mc-shg', name: 'Shanghai', lon: 121.474, lat: 31.230, tz: 'Asia/Shanghai', exch: 'SSE' },
  { id: 'mc-sin', name: 'Singapore', lon: 103.852, lat: 1.290, tz: 'Asia/Singapore', exch: 'SGX' },
  { id: 'mc-syd', name: 'Sydney', lon: 151.209, lat: -33.868, tz: 'Australia/Sydney', exch: 'ASX' },
];

/** Rough "is this exchange likely open?" check from local hour (Mon–Fri 9–17). */
export function isMarketOpen(tz, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: 'numeric', hour12: false,
    }).formatToParts(date);
    const wd = parts.find((p) => p.type === 'weekday')?.value;
    const hr = +(parts.find((p) => p.type === 'hour')?.value ?? -1);
    const weekday = !['Sat', 'Sun'].includes(wd);
    return weekday && hr >= 9 && hr < 17;
  } catch (_) {
    return null; // unknown
  }
}
