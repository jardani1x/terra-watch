// ============================================================
//  marketProvider.js — real, key-less market data
//  FX:     api.frankfurter.dev/v1 (ECB reference rates, CORS *, no key)
//  Crypto: api.coingecko.com      (public demo tier, CORS *, no key)
//  Both normalize to the shared Quote shape. No user data is ever sent — these
//  are global instruments, not location queries. Callers fall back to the mock
//  provider on any throw (offline / rate-limit / CORS).
//  NOTE: we hit frankfurter.dev directly; the older api.frankfurter.app host
//  301-redirects here but its redirect response omits CORS headers, so the
//  browser blocks the chain — always use the .dev host from the browser.
// ============================================================

import { fetchJSON } from './http.js';

/** @typedef {import('./types.js').Quote} Quote */

const FX_PAIRS = [
  ['EUR', 'EURUSD', 'EUR/USD'],
  ['GBP', 'GBPUSD', 'GBP/USD'],
  ['JPY', 'USDJPY', 'USD/JPY'],
  ['CHF', 'USDCHF', 'USD/CHF'],
  ['AUD', 'AUDUSD', 'AUD/USD'],
  ['CNY', 'USDCNY', 'USD/CNY'],
];

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Live FX vs USD with ~7-day percent change.
 * Frankfurter quotes everything as USD->X; for pairs we display as X/USD
 * (EUR/USD, GBP/USD, AUD/USD) we invert both the level and the change sign.
 * @returns {Promise<Quote[]>}
 */
export async function fetchFx() {
  const to = FX_PAIRS.map((p) => p[0]).join(',');
  const start = new Date(Date.now() - 9 * 86400000);
  const url = `https://api.frankfurter.dev/v1/${ymd(start)}..?base=USD&symbols=${to}`;
  const json = await fetchJSON(url);
  const dates = Object.keys(json.rates || {}).sort();
  if (!dates.length) throw new Error('frankfurter empty');
  const first = json.rates[dates[0]];
  const last = json.rates[dates[dates.length - 1]];
  const ts = Date.parse(dates[dates.length - 1] + 'T00:00:00Z');

  return FX_PAIRS.map(([ccy, symbol, label]) => {
    const lastRate = last?.[ccy];
    const firstRate = first?.[ccy];
    if (lastRate == null) return null;
    // USD->X rate; invert for the "X/USD" display pairs.
    const invert = symbol.startsWith(ccy); // EURUSD/GBPUSD/AUDUSD -> X per USD inverted
    const value = invert ? 1 / lastRate : lastRate;
    let change = null;
    if (firstRate != null) {
      const prev = invert ? 1 / firstRate : firstRate;
      change = ((value - prev) / prev) * 100;
    }
    return { symbol, label, kind: 'fx', value, change, ts, source: 'Frankfurter', stale: false };
  }).filter(Boolean);
}

const COINS = [
  ['bitcoin', 'BTC', 'Bitcoin'],
  ['ethereum', 'ETH', 'Ethereum'],
  ['solana', 'SOL', 'Solana'],
  ['ripple', 'XRP', 'XRP'],
];

/**
 * Live crypto spot + 24h percent change.
 * @returns {Promise<Quote[]>}
 */
export async function fetchCrypto() {
  const ids = COINS.map((c) => c[0]).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;
  const json = await fetchJSON(url);
  return COINS.map(([id, symbol, label]) => {
    const row = json[id];
    if (!row) return null;
    return {
      symbol, label, kind: 'crypto',
      value: row.usd ?? null,
      change: row.usd_24h_change ?? null,
      ts: row.last_updated_at ? row.last_updated_at * 1000 : Date.now(),
      source: 'CoinGecko', stale: false,
    };
  }).filter(Boolean);
}
