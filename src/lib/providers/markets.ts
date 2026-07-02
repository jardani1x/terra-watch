import type { DataMode } from './types';

// Market snapshot — not geo events, so this feeds the MARKETS panel, not the
// map. Two keyless, CORS-enabled feeds, live-probed 2026-07-02:
//  - Frankfurter: ECB daily reference FX rates (https://frankfurter.dev/)
//  - CoinGecko free API: BTC/ETH spot + 24h change (attribution required)
const FX_FEED = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,JPY,GBP,CNY';
const CRYPTO_FEED = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true';

export const MARKETS_META = {
  id: 'markets',
  name: 'Markets (FX · crypto)',
  license: 'ECB reference rates via Frankfurter · price data by CoinGecko',
  homepage: 'https://frankfurter.dev/',
};

export interface MarketQuote {
  id: string;
  label: string;
  /** preformatted display value */
  value: string;
  /** percent, only where the feed provides it (crypto 24h) */
  change24h?: number;
  source: string;
  /** feed's own as-of date, when it states one (ECB rates are daily) */
  asOf?: string;
}

export interface MarketResult {
  quotes: MarketQuote[];
  mode: DataMode;
  latencyMs: number;
  error: string | null;
}

/** Clearly-labelled MOCK sample for offline fallback (mode: 'mock'). */
const MOCK: MarketQuote[] = [
  { id: 'fx-eur', label: 'USD/EUR', value: '0.88', source: 'sample data (offline)' },
  { id: 'crypto-btc', label: 'BTC', value: '$60,000', change24h: 0, source: 'sample data (offline)' },
];

interface FxJson { date: string; rates: Record<string, number> }
type CryptoJson = Record<string, { usd: number; usd_24h_change?: number }>;

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchMarkets(signal?: AbortSignal): Promise<MarketResult> {
  const started = performance.now();
  const [fx, crypto] = await Promise.allSettled([
    getJson<FxJson>(FX_FEED, signal),
    getJson<CryptoJson>(CRYPTO_FEED, signal),
  ]);
  if (signal?.aborted) throw new Error('aborted');

  const quotes: MarketQuote[] = [];
  const failures: string[] = [];

  if (fx.status === 'fulfilled') {
    for (const [sym, rate] of Object.entries(fx.value.rates)) {
      quotes.push({
        id: `fx-${sym.toLowerCase()}`,
        label: `USD/${sym}`,
        value: rate >= 10 ? rate.toFixed(2) : rate.toFixed(4),
        source: 'ECB via Frankfurter',
        asOf: fx.value.date,
      });
    }
  } else {
    failures.push(`Frankfurter: ${fx.reason instanceof Error ? fx.reason.message : 'failed'}`);
  }

  if (crypto.status === 'fulfilled') {
    for (const [id, label] of [['bitcoin', 'BTC'], ['ethereum', 'ETH']] as const) {
      const q = crypto.value[id];
      if (!q) continue;
      quotes.push({
        id: `crypto-${label.toLowerCase()}`,
        label,
        value: `$${q.usd.toLocaleString('en-US', { maximumFractionDigits: q.usd >= 100 ? 0 : 2 })}`,
        change24h: q.usd_24h_change,
        source: 'CoinGecko',
      });
    }
  } else {
    failures.push(`CoinGecko: ${crypto.reason instanceof Error ? crypto.reason.message : 'failed'}`);
  }

  const latencyMs = Math.round(performance.now() - started);
  if (quotes.length === 0) {
    return { quotes: MOCK, mode: 'mock', latencyMs, error: failures.join(' · ') || 'fetch failed' };
  }
  return { quotes, mode: 'live', latencyMs, error: failures.length ? failures.join(' · ') : null };
}
