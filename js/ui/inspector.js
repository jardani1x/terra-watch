// ============================================================
//  inspector.js — right-hand entity inspector
//  Renders a selected map object (market center, quake, watchlist pin, country,
//  event…) as a structured card: type chip, title, key/value fields, linked
//  entities (ontology neighbors), and contextual actions. Pure DOM; the
//  orchestrator builds the descriptor and supplies action callbacks.
// ============================================================

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @typedef {Object} InspectorView
 * @property {string} type     entity type chip (e.g. "MarketInstrument")
 * @property {string} title
 * @property {string} [subtitle]
 * @property {{k:string,v:string}[]} [fields]
 * @property {{type:string,label:string,id?:string}[]} [relations]
 * @property {{label:string, kind?:string, onClick:()=>void}[]} [actions]
 */

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.panel  the #inspector dock (shown/hidden)
 * @param {HTMLElement} opts.body   the scroll container for content
 * @param {HTMLElement} opts.closeBtn
 * @param {()=>void} [opts.onClose]
 * @param {(id:string)=>void} [opts.onPickRelation] select a linked entity by id
 */
export function initInspector({ panel, body, closeBtn, onClose, onPickRelation }) {
  function clear() {
    body.innerHTML =
      `<div class="insp-empty">NO ENTITY SELECTED<br><span>Click a marker or country on the globe,
       or a market card, to inspect it.</span></div>`;
  }

  function hide() {
    panel.setAttribute('hidden', '');
    onClose?.();
  }

  /** @param {InspectorView} v */
  function show(v) {
    const fields = (v.fields || []).filter((f) => f && f.v != null && f.v !== '');
    const rels = v.relations || [];
    const actions = v.actions || [];

    body.innerHTML = `
      <div class="insp-type">${esc(v.type)}</div>
      <div class="insp-title">${esc(v.title)}</div>
      ${v.subtitle ? `<div class="insp-sub">${esc(v.subtitle)}</div>` : ''}
      ${fields.length ? `<div class="insp-grid">${fields.map((f) =>
        `<div class="insp-k">${esc(f.k)}</div><div class="insp-v">${esc(f.v)}</div>`).join('')}</div>` : ''}
      ${rels.length ? `<div class="insp-sec">LINKED ENTITIES</div>
        <ul class="insp-rels">${rels.map((r) => {
          const clickable = !!(onPickRelation && r.id);
          return `<li class="rel${clickable ? ' clickable' : ''}"` +
            (clickable ? ` data-rel-id="${esc(r.id)}" role="button" tabindex="0" style="cursor:pointer"` : '') +
            `><span class="rel-type">${esc(r.type)}</span><span class="rel-label">${esc(r.label)}</span></li>`;
        }).join('')}</ul>` : ''}
      <div class="insp-actions"></div>`;

    // Clickable linked entities → select that entity through the injected handler.
    if (onPickRelation) {
      body.querySelectorAll('.insp-rels li[data-rel-id]').forEach((li) => {
        const id = li.getAttribute('data-rel-id');
        const go = () => onPickRelation(id);
        li.addEventListener('click', go);
        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
        });
      });
    }

    const actHost = body.querySelector('.insp-actions');
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.className = 'insp-btn' + (a.kind ? ' ' + a.kind : '');
      btn.textContent = a.label;
      btn.addEventListener('click', a.onClick);
      actHost.appendChild(btn);
    }

    panel.removeAttribute('hidden');
    body.scrollTop = 0;
  }

  closeBtn?.addEventListener('click', hide);
  clear();

  return { show, clear, hide, get visible() { return !panel.hasAttribute('hidden'); } };
}
