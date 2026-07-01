// ============================================================
//  types.js — shared data shapes (JSDoc typedefs; no runtime exports)
//  Importing this file is optional; it exists so editors and readers have a
//  single source of truth for the normalized objects every provider returns.
// ============================================================

/**
 * @typedef {'fx'|'crypto'|'index'|'commodity'} InstrumentKind
 *
 * @typedef {Object} Quote
 * @property {string} symbol      stable id, e.g. "EURUSD", "BTC", "SPX"
 * @property {string} label       display label, e.g. "EUR/USD", "Bitcoin"
 * @property {InstrumentKind} kind
 * @property {number|null} value  latest price/level
 * @property {number|null} change percent change (24h or vs prior close)
 * @property {number} ts          epoch ms of the value
 * @property {string} source      human-readable origin ("CoinGecko", "Mock")
 * @property {boolean} stale       true once the value ages past the freshness window
 *
 * @typedef {Object} QuakeEvent
 * @property {string} id
 * @property {number} mag
 * @property {string} place
 * @property {number} lon
 * @property {number} lat
 * @property {number} depthKm
 * @property {number} ts          epoch ms of the event
 * @property {string} source
 *
 * @typedef {Object} WeatherPoint
 * @property {number} lon
 * @property {number} lat
 * @property {number|null} tempC
 * @property {number|null} windKmh
 * @property {number|null} code   WMO weather code
 * @property {string} summary
 * @property {number} ts
 * @property {string} source
 *
 * @typedef {Object} GeoMarker
 * @property {string} id
 * @property {string} kind        layer id this marker belongs to
 * @property {number} lon
 * @property {number} lat
 * @property {string} label
 * @property {number} [weight]    0..1 intensity (drives marker size / risk heat)
 * @property {Object} [meta]      arbitrary detail rendered by the inspector
 *
 * @typedef {Object} ProviderResult
 * @property {Array} data
 * @property {string} source
 * @property {boolean} mock        true when the mock adapter supplied the data
 * @property {string|null} error   null on success, message on failure
 * @property {number} ts
 */

export {}; // module marker — keeps this importable even though it is types-only
