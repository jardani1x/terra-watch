// ============================================================
//  search.js — faceted asset-search workspace
//  Owns the Search panel: a name filter box, a row of facet chips with LIVE
//  counts, and a results list. It holds NO scene/ontology state — it asks the
//  orchestrator to fetch (onRun), then renders whatever it's handed back via
//  setResults(). Facet toggles + the text box filter the fetched set CLIENT-SIDE
//  (no refetch); the visible subset is pushed back to the app (onResults) so the
//  globe markers stay in sync, and clicking a row selects through the bus.
// ============================================================
import { ASSET_FACETS } from '../data/providers/overpassProvider.js';

/**
 * @param {Object} opts
 * @param {HTMLInputElement} opts.input        name filter box
 * @param {HTMLElement}      opts.facetHost     container for facet chips
 * @param {HTMLButtonElement} opts.runBtn        "search this view" trigger
 * @param {HTMLElement}      opts.results        results-list host
 * @param {HTMLElement}      opts.statusEl       one-line status / count readout
 * @param {(facetIds:string[])=>void}  opts.onRun      fetch for these facets
 * @param {(items:Object[])=>void}     opts.onResults  visible set changed → redraw markers
 * @param {(id:string)=>void}          opts.onSelect   a row was clicked
 */
export function initSearch({ input, facetHost, runBtn, results, statusEl, onRun, onResults, onSelect }) {
  const active = new Set(ASSET_FACETS.map((f) => f.id));   // all facets on initially
  /** @type {Object[]} */
  let data = [];
  let query = '';
  const chips = {};

  // ---- facet chips (toggle + count badge) ----
  for (const f of ASSET_FACETS) {
    const b = document.createElement('button');
    b.className = 'facet on';
    b.type = 'button';
    b.dataset.facet = f.id;
    b.innerHTML =
      `<span class="facet-dot" style="background:${f.color}"></span>` +
      `<span class="facet-lbl">${f.label}</span><span class="facet-n">0</span>`;
    b.addEventListener('click', () => {
      if (active.has(f.id)) active.delete(f.id); else active.add(f.id);
      b.classList.toggle('on', active.has(f.id));
      render();
    });
    facetHost.appendChild(b);
    chips[f.id] = b;
  }

  const visible = () =>
    data.filter((it) => active.has(it.facet) &&
      (!query || it.label.toLowerCase().includes(query)));

  function render() {
    // live per-facet counts over the full fetched set
    for (const f of ASSET_FACETS) {
      const n = data.filter((it) => it.facet === f.id).length;
      chips[f.id].querySelector('.facet-n').textContent = String(n);
      chips[f.id].classList.toggle('empty', n === 0);
    }
    const vis = visible();
    results.innerHTML = vis.length
      ? vis.slice(0, 200).map((it) =>
          `<button class="sr-row" data-id="${it.id}">` +
          `<span class="sr-dot" style="background:${it.color}"></span>` +
          `<span class="sr-name">${esc(it.label)}</span>` +
          `<span class="sr-cat">${it.facetLabel}</span></button>`).join('')
      : `<p class="ws-empty">${data.length
          ? 'No assets match the active facets / filter.'
          : 'Pick facets, then “Search this view” to query OpenStreetMap for civilian assets in the current map area.'}</p>`;
    if (statusEl && data.length) {
      statusEl.textContent = `${vis.length} shown · ${data.length} found`;
    }
    onResults?.(vis);
  }

  results.addEventListener('click', (e) => {
    const row = e.target.closest('.sr-row');
    if (row) onSelect?.(row.dataset.id);
  });

  input?.addEventListener('input', () => { query = input.value.trim().toLowerCase(); render(); });

  function run() {
    if (active.size === 0) { if (statusEl) statusEl.textContent = 'Select at least one facet.'; return; }
    onRun?.([...active]);
  }
  runBtn?.addEventListener('click', run);
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });

  render();

  return {
    /** Hand back fetched results + provider meta; recomputes counts + markers. */
    setResults(rows, meta = {}) {
      data = rows || [];
      if (statusEl) statusEl.textContent =
        `${data.length} found · ${meta.mock ? 'MOCK' : (meta.source || 'OSM')}`;
      render();
    },
    setBusy(on) { if (statusEl && on) statusEl.textContent = 'Querying OpenStreetMap…'; },
    activeFacets: () => [...active],
  };
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
