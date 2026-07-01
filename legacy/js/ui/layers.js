// ============================================================
//  layers.js — map-layer registry + toggle UI
//  Owns ONLY the on/off state and the toggle rows in the left rail. Rendering
//  markers onto the globe is the orchestrator's job (it owns Three.js): this
//  module just emits onToggle(id, enabled) and tracks state. Keeps Three.js out
//  of the UI layer and lets the same registry drive the command palette.
// ============================================================

/**
 * @typedef {Object} LayerDef
 * @property {string} id
 * @property {string} label
 * @property {string} glyph
 * @property {boolean} defaultOn
 * @property {string} accent   marker color (CSS)
 * @property {boolean} [optIn]  requires explicit consent before first enable
 * @property {string} [note]
 */

/** @type {LayerDef[]} */
export const LAYERS = [
  { id: 'markets',      label: 'Market Centers', glyph: '◆', defaultOn: true,  accent: '#45e0b0' },
  { id: 'watchlist',    label: 'Watchlist',      glyph: '★', defaultOn: true,  accent: '#ffd166' },
  { id: 'earthquakes',  label: 'Seismic Events', glyph: '◉', defaultOn: false, accent: '#ff8a5a' },
  { id: 'weather',      label: 'Weather',        glyph: '☁', defaultOn: false, accent: '#7ec8ff' },
  { id: 'geopolitical', label: 'Geo Events',     glyph: '⚑', defaultOn: false, accent: '#c08bff', note: 'mock' },
  { id: 'risk',         label: 'Risk Heat',      glyph: '▲', defaultOn: false, accent: '#ff5a52', note: 'mock' },
  { id: 'trail',        label: 'Movement Trail', glyph: '∿', defaultOn: false, accent: '#45e0b0' },
];

const byId = Object.fromEntries(LAYERS.map((l) => [l.id, l]));

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.host           container for the toggle rows
 * @param {Record<string,boolean>} [opts.initial] persisted state
 * @param {(id:string, enabled:boolean)=>void} opts.onToggle
 */
export function initLayers({ host, initial = {}, onToggle }) {
  /** @type {Record<string,boolean>} */
  const state = {};
  /** @type {Record<string,HTMLElement>} */
  const rows = {};

  for (const def of LAYERS) {
    state[def.id] = initial[def.id] ?? def.defaultOn;

    const row = document.createElement('button');
    row.className = 'layer-row';
    row.type = 'button';
    row.setAttribute('role', 'switch');
    row.dataset.layer = def.id;
    row.innerHTML =
      `<span class="ly-glyph" style="color:${def.accent}">${def.glyph}</span>` +
      `<span class="ly-label">${def.label}${def.note ? ` <i class="ly-note">${def.note}</i>` : ''}</span>` +
      `<span class="ly-sw" aria-hidden="true"></span>`;
    row.addEventListener('click', () => setOn(def.id, !state[def.id]));
    host.appendChild(row);
    rows[def.id] = row;
    reflect(def.id);
  }

  function reflect(id) {
    const on = !!state[id];
    rows[id].classList.toggle('on', on);
    rows[id].setAttribute('aria-checked', String(on));
  }

  function setOn(id, enabled) {
    if (!(id in state) || state[id] === enabled) { reflect(id); return; }
    state[id] = enabled;
    reflect(id);
    onToggle(id, enabled);
  }

  return {
    isOn: (id) => !!state[id],
    setOn,
    toggle: (id) => setOn(id, !state[id]),
    getState: () => ({ ...state }),
    def: (id) => byId[id],
    /** Fire onToggle for every currently-enabled layer (initial paint). */
    emitEnabled() { for (const id in state) if (state[id]) onToggle(id, true); },
  };
}
