// ============================================================
//  feeds.js — feed orchestrator
//  Single seam between the UI and the providers. Tries the real (key-less) API,
//  falls back to the mock adapter on any failure, stamps freshness, and reports
//  which path supplied the data so the UI can show a "MOCK"/"STALE" badge.
//  Swapping in a paid/real source later means editing only the provider import.
// ============================================================

import { fetchFx, fetchCrypto } from './providers/marketProvider.js';
import { fetchQuakes } from './providers/earthquakeProvider.js';
import { fetchWeather } from './providers/weatherProvider.js';
import {
  mockFx, mockCrypto, mockIndices, mockCommodities,
  mockQuakes, mockWeather,
} from './providers/mockProvider.js';

/** A quote/event is considered stale once older than this. */
export const STALE_MS = 5 * 60 * 1000;

/** @param {number} ts @returns {boolean} */
export const isStale = (ts) => Date.now() - ts > STALE_MS;

// Freshness window per instrument kind. FX uses daily ECB reference rates, so a
// 5-minute window would flag every quote as stale; give it a generous day-plus.
const STALE_BY_KIND = {
  crypto: STALE_MS,            // live spot — 5 min
  fx: 5 * 24 * 60 * 60 * 1000, // daily ECB reference — tolerate weekends/holidays
  index: 10 * 60 * 1000,       // mock, regenerated each poll
  commodity: 10 * 60 * 1000,
};

/** Mark each quote stale based on its kind-appropriate freshness window. */
export function markStale(quotes) {
  for (const q of quotes) q.stale = Date.now() - q.ts > (STALE_BY_KIND[q.kind] || STALE_MS);
  return quotes;
}

/**
 * @template T
 * @param {() => Promise<T[]>} real
 * @param {() => T[]} mock
 * @param {string} sourceLabel
 * @returns {Promise<import('./providers/types.js').ProviderResult>}
 */
async function tryReal(real, mock, sourceLabel) {
  try {
    const data = await real();
    if (!data || !data.length) throw new Error('empty');
    return { data, source: sourceLabel, mock: false, error: null, ts: Date.now() };
  } catch (e) {
    return { data: mock(), source: 'Mock', mock: true, error: String(e.message || e), ts: Date.now() };
  }
}

/**
 * All market instruments. FX + crypto are real; indices + commodities have no
 * free key-less source, so they are mock by design (clearly labelled).
 * @returns {Promise<import('./providers/types.js').ProviderResult>}
 */
export async function getMarketQuotes() {
  const [fx, crypto] = await Promise.all([
    tryReal(fetchFx, mockFx, 'Frankfurter'),
    tryReal(fetchCrypto, mockCrypto, 'CoinGecko'),
  ]);
  const indices = mockIndices();      // no free real source
  const commodities = mockCommodities();
  const data = [...fx.data, ...crypto.data, ...indices, ...commodities];
  markStale(data);
  const usedMock = fx.mock || crypto.mock;
  return {
    data,
    source: [fx.source, crypto.source, 'Mock(idx/cmd)'].join(' · '),
    mock: usedMock,
    error: fx.error || crypto.error,
    ts: Date.now(),
  };
}

/** Recent earthquakes (USGS → mock). */
export function getQuakes() {
  return tryReal(() => fetchQuakes(60), mockQuakes, 'USGS');
}

/**
 * Weather at an explicit point (opt-in for the user's own location).
 * @param {number} lon @param {number} lat
 */
export async function getWeather(lon, lat) {
  try {
    const w = await fetchWeather(lon, lat);
    return { data: [w], source: 'Open-Meteo', mock: false, error: null, ts: Date.now() };
  } catch (e) {
    return { data: [mockWeather(lon, lat)], source: 'Mock', mock: true, error: String(e.message || e), ts: Date.now() };
  }
}
