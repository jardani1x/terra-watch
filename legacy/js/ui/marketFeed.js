// ============================================================
//  marketFeed.js — market intelligence cards
//  Renders normalized Quote[] grouped by kind into the right rail. Each card
//  shows price, % change, age, source, and a STALE badge when the value ages
//  past the freshness window. Explicit loading / error / empty states. Clicking
//  a card hands the quote back to the orchestrator (→ inspector).
// ============================================================

import { fmtPrice, fmtPct, signClass, relTime } from '../util/format.js';

/** @typedef {import('../data/providers/types.js').Quote} Quote */

const GROUPS = [
  ['fx', 'FX'],
  ['crypto', 'CRYPTO'],
  ['index', 'INDICES'],
  ['commodity', 'COMMODITIES'],
];

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.host
 * @param {(q:Quote)=>void} [opts.onSelect]
 */
export function initMarketFeed({ host, onSelect }) {
  /** @type {Quote[]} */
  let current = [];

  function card(q) {
    const sc = signClass(q.change);
    return `<button class="mk-card${q.stale ? ' stale' : ''}" data-sym="${q.symbol}" type="button">
      <span class="mk-sym">${q.label}</span>
      <span class="mk-val">${fmtPrice(q.value)}</span>
      <span class="mk-chg ${sc}">${fmtPct(q.change)}</span>
      <span class="mk-meta">${q.stale ? '<i class="mk-badge">STALE</i>' : ''}${q.source} · ${relTime(q.ts)}</span>
    </button>`;
  }

  function setLoading() {
    host.innerHTML = '<div class="mk-msg">ACQUIRING MARKET FEED…</div>';
  }

  function setError(msg) {
    host.innerHTML = `<div class="mk-msg warn">FEED DEGRADED · ${msg || 'USING MOCK DATA'}</div>`;
  }

  /**
   * @param {Quote[]} quotes
   * @param {{mock?:boolean, source?:string, error?:string|null}} [meta]
   */
  function render(quotes, meta = {}) {
    current = quotes || [];
    if (!current.length) { host.innerHTML = '<div class="mk-msg">NO INSTRUMENTS</div>'; return; }

    let html = '';
    if (meta.mock) html += `<div class="mk-note warn">⚠ LIVE FEED UNREACHABLE · SHOWING MOCK PRICES</div>`;
    for (const [kind, title] of GROUPS) {
      const rows = current.filter((q) => q.kind === kind);
      if (!rows.length) continue;
      html += `<div class="mk-group">${title}</div><div class="mk-cards">${rows.map(card).join('')}</div>`;
    }
    host.innerHTML = html;
  }

  host.addEventListener('click', (e) => {
    const el = e.target.closest('.mk-card');
    if (!el) return;
    const q = current.find((x) => x.symbol === el.dataset.sym);
    if (q) onSelect?.(q);
  });

  return { render, setLoading, setError, get quotes() { return current; } };
}
