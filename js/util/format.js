// ============================================================
//  format.js — display formatters for the dashboard (no DOM, no deps)
// ============================================================

/**
 * Format a price/level with sensible precision: more decimals for small
 * numbers (FX, sub-dollar crypto), fewer for large ones (BTC, indices).
 * @param {number|null|undefined} n
 * @returns {string}
 */
export function fmtPrice(n) {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  const digits = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits });
}

/**
 * Signed percentage, e.g. "+1.24%" / "-0.30%".
 * @param {number|null|undefined} pct
 * @returns {string}
 */
export function fmtPct(pct) {
  if (pct == null || !isFinite(pct)) return '—';
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
}

/** Sign class used by CSS for up/down/flat coloring. */
export function signClass(pct) {
  if (pct == null || !isFinite(pct) || Math.abs(pct) < 0.005) return 'flat';
  return pct > 0 ? 'up' : 'down';
}

/**
 * Compact relative age, e.g. "now", "3m", "2h", "4d".
 * @param {number} ts epoch ms
 * @returns {string}
 */
export function relTime(ts) {
  if (!ts) return '—';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 10) return 'now';
  if (s < 60) return Math.floor(s) + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

/** Zero-padded HH:MM:SS in local time for "last updated" lines. */
export function clockTime(ts = Date.now()) {
  return new Date(ts).toTimeString().slice(0, 8);
}

/** Compact magnitude label for a number (1.2K, 3.4M). */
export function fmtCompact(n) {
  if (n == null || !isFinite(n)) return '—';
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
