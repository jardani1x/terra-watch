// ============================================================
//  navrail.js — vertical icon nav rail + swappable workspaces
//  One source of truth for "which workspace is visible". The rail renders an
//  icon button per workspace; clicking one shows the matching <section
//  data-ws="…"> inside the workspace container and hides the rest. Pure DOM:
//  the panels' CONTENT (layer toggles, market feed, …) is wired by their own
//  modules elsewhere — this only owns visibility + the active highlight.
//
//  The INSPECTOR is intentionally NOT a workspace: it is selection-driven and
//  lives in its own dock so it can appear over any active workspace.
// ============================================================

/**
 * @typedef {Object} WorkspaceDef
 * @property {string} id     matches a <section data-ws="id"> in the container
 * @property {string} glyph  icon shown in the rail
 * @property {string} label  short caption + a11y label
 */

/** @type {WorkspaceDef[]} — order = top-to-bottom in the rail. */
export const WORKSPACES = [
  { id: 'layers',   glyph: '▤', label: 'Layers'   },
  { id: 'visual',   glyph: '◑', label: 'Visual'   },
  { id: 'feeds',    glyph: '$', label: 'Feeds'    },
  { id: 'measure',  glyph: '⟟', label: 'Measure'  },
  { id: 'search',   glyph: '⌕', label: 'Search'   },
  { id: 'tracking', glyph: '✦', label: 'Tracking' },
  { id: 'graph',    glyph: '⬡', label: 'Graph'    },
  { id: 'timeline', glyph: '◷', label: 'Timeline' },
];

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.nav        the icon rail host (buttons are appended)
 * @param {HTMLElement} opts.workspace  container holding the <section data-ws> panels
 * @param {string} [opts.initial]       workspace id shown first
 * @param {(id:string)=>void} [opts.onChange]
 */
export function initNavRail({ nav, workspace, initial = 'layers', onChange }) {
  /** @type {Record<string,HTMLButtonElement>} */
  const btns = {};
  /** @type {Record<string,HTMLElement|null>} */
  const panels = {};

  for (const ws of WORKSPACES) {
    const b = document.createElement('button');
    b.className = 'nav-btn';
    b.type = 'button';
    b.dataset.ws = ws.id;
    b.title = ws.label;
    b.setAttribute('aria-label', ws.label);
    b.setAttribute('role', 'tab');
    b.innerHTML =
      `<span class="nav-glyph" aria-hidden="true">${ws.glyph}</span>` +
      `<span class="nav-lbl">${ws.label}</span>`;
    b.addEventListener('click', () => show(ws.id));
    nav.appendChild(b);
    btns[ws.id] = b;
    panels[ws.id] = workspace.querySelector(`[data-ws="${ws.id}"]`);
  }

  let active = null;

  function show(id) {
    if (!btns[id]) return;
    active = id;
    for (const ws of WORKSPACES) {
      const on = ws.id === id;
      btns[ws.id].classList.toggle('active', on);
      btns[ws.id].setAttribute('aria-selected', String(on));
      const p = panels[ws.id];
      if (p) p.toggleAttribute('hidden', !on);
    }
    onChange?.(id);
  }

  show(initial);

  return {
    show,
    current: () => active,
  };
}
