// ============================================================
//  mockProvider.js — offline fallback generators
//  Every feed degrades to these when its real API is unavailable (offline,
//  CORS, rate-limit) so the dashboard always has plausible, clearly-labelled
//  data. Values wander deterministically from a seeded base so successive
//  polls look "live" without ever touching the network.
// ============================================================

/** @typedef {import('./types.js').Quote} Quote */

const now = () => Date.now();

// Deterministic-ish noise: a slow sine keyed to wall-clock minutes plus a
// per-symbol phase, so each refresh nudges values without random jumps.
function drift(seed, amp) {
  const t = now() / 60000; // minutes
  const phase = (seed * 12.9898) % (Math.PI * 2);
  return Math.sin(t * 0.7 + phase) * amp;
}

const FX_BASE = [
  ['EURUSD', 'EUR/USD', 1.0850],
  ['GBPUSD', 'GBP/USD', 1.2720],
  ['USDJPY', 'USD/JPY', 157.30],
  ['USDCHF', 'USD/CHF', 0.8930],
  ['AUDUSD', 'AUD/USD', 0.6650],
  ['USDCNY', 'USD/CNY', 7.2500],
];

const CRYPTO_BASE = [
  ['BTC', 'Bitcoin', 67000],
  ['ETH', 'Ethereum', 3500],
  ['SOL', 'Solana', 165],
  ['XRP', 'XRP', 0.52],
];

const INDEX_BASE = [
  ['SPX', 'US 500', 5430],
  ['NDX', 'US Tech 100', 19500],
  ['DJI', 'US 30', 38800],
  ['UKX', 'UK 100', 8240],
  ['DAX', 'Germany 40', 18400],
  ['N225', 'Japan 225', 38700],
  ['HSI', 'HK 50', 18100],
];

const COMMODITY_BASE = [
  ['XAU', 'Gold', 2330],
  ['XAG', 'Silver', 30.5],
  ['WTI', 'Crude WTI', 78.4],
  ['NG', 'Nat Gas', 2.75],
];

/**
 * @param {[string,string,number][]} base
 * @param {import('./types.js').InstrumentKind} kind
 * @returns {Quote[]}
 */
function build(base, kind) {
  return base.map(([symbol, label, price], i) => {
    const d = drift(i + 1 + kind.length, price * 0.012);
    const value = price + d;
    const change = (d / price) * 100 + drift(i + 7, 0.4);
    return { symbol, label, kind, value, change, ts: now(), source: 'Mock', stale: false };
  });
}

/** @returns {Quote[]} */
export const mockFx = () => build(FX_BASE, 'fx');
/** @returns {Quote[]} */
export const mockCrypto = () => build(CRYPTO_BASE, 'crypto');
/** @returns {Quote[]} */
export const mockIndices = () => build(INDEX_BASE, 'index');
/** @returns {Quote[]} */
export const mockCommodities = () => build(COMMODITY_BASE, 'commodity');

/** Synthetic seismic events scattered along plausible fault belts. */
export function mockQuakes() {
  const spots = [
    [139.7, 35.7, 'Off Honshu, Japan'],
    [-122.3, 37.8, 'N. California'],
    [120.9, 14.6, 'Luzon, Philippines'],
    [-70.7, -33.4, 'Valparaíso, Chile'],
    [25.1, 38.4, 'Aegean Sea'],
    [86.9, 27.9, 'Nepal Himalaya'],
    [-155.3, 19.4, "Hawai'i Island"],
    [142.4, -5.5, 'New Guinea'],
  ];
  return spots.map(([lon, lat, place], i) => ({
    id: 'mock-q' + i,
    mag: +(3 + ((i * 1.7) % 4)).toFixed(1),
    place,
    lon,
    lat,
    depthKm: 5 + ((i * 23) % 120),
    ts: now() - i * 1800000,
    source: 'Mock',
  }));
}

/** @returns {import('./types.js').WeatherPoint} */
export function mockWeather(lon, lat) {
  const tempC = 12 + drift(Math.round(lat), 9);
  return {
    lon, lat,
    tempC: +tempC.toFixed(1),
    windKmh: +(8 + Math.abs(drift(lon, 14))).toFixed(0),
    code: 2,
    summary: 'Partly cloudy (simulated)',
    ts: now(),
    source: 'Mock',
  };
}

/** Mock geopolitical / event markers (clearly fictional, for the overlay demo). */
export function mockGeopolitical() {
  const ev = [
    [30.5, 50.4, 'Energy supply advisory'],
    [55.3, 25.3, 'Shipping-lane watch'],
    [114.2, 22.3, 'Market-hours notice'],
    [-99.1, 19.4, 'Severe-weather watch'],
    [37.6, 55.8, 'Sanctions update'],
    [101.7, 3.1, 'Commodity export notice'],
  ];
  return ev.map(([lon, lat, label], i) => ({
    id: 'mock-ev' + i, kind: 'geopolitical', lon, lat, label,
    weight: 0.4 + ((i * 0.13) % 0.5),
    meta: { category: 'Open-source advisory', note: 'Illustrative mock event — not a real alert.' },
  }));
}

/** Mock "risk" intensity points used by the heatmap-style layer. */
export function mockRisk() {
  const pts = [];
  const seeds = [[44, 33], [69, 34], [-66, 10], [125, 38], [15, 12], [-3, 36]];
  for (let i = 0; i < seeds.length; i++) {
    const [lon, lat] = seeds[i];
    pts.push({ id: 'risk' + i, kind: 'risk', lon, lat, label: 'Elevated risk zone', weight: 0.5 + ((i * 0.2) % 0.5), meta: { note: 'Illustrative composite index (mock).' } });
  }
  return pts;
}
