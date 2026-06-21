// ============================================================
//  tracking.js — sat / aircraft / vessel tracking workspace
//  Owns the Tracking panel: a row per feed (enable toggle + a LIVE count/source
//  badge that honestly shows MOCK / STALE), an "in-view refresh" trigger, and an
//  optional, local-only credential form (OpenSky OAuth2 + reserved AIS key). It
//  holds NO scene/provider state: the toggles call onToggle(feed,on), the app
//  fetches/propagates and hands status back via setStatus(); reflect() keeps the
//  switch visuals in sync when the same layer is toggled elsewhere (Layers rail /
//  command palette). Civilian situational-awareness only — never tasking.
// ============================================================

/** @type {{id:string,glyph:string,label:string,src:string}[]} — render order. */
export const FEEDS = [
  { id: 'satellites', glyph: '✦', label: 'Satellites', src: 'CelesTrak' },
  { id: 'flights',    glyph: '✈', label: 'Aircraft',   src: 'OpenSky'   },
  { id: 'vessels',    glyph: '⚓', label: 'Vessels',    src: 'AIS'       },
];

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.host        container for the feed rows
 * @param {HTMLButtonElement} opts.refreshBtn  re-query the feeds in the current view
 * @param {Object} opts.creds            credential-form elements
 * @param {HTMLInputElement} opts.creds.idInput
 * @param {HTMLInputElement} opts.creds.secretInput
 * @param {HTMLInputElement} opts.creds.aisInput
 * @param {HTMLButtonElement} opts.creds.saveBtn
 * @param {HTMLButtonElement} opts.creds.clearBtn
 * @param {HTMLElement} opts.creds.note
 * @param {{clientId?:string,clientSecret?:string,aisKey?:string}} [opts.initialCreds]
 * @param {(feed:string)=>boolean} opts.isOn       current layer state (source of truth)
 * @param {(feed:string, on:boolean)=>void} opts.onToggle
 * @param {()=>void} opts.onRefresh
 * @param {(creds:Object)=>void} opts.onSaveCreds
 */
export function initTracking({ host, refreshBtn, creds, initialCreds = {}, isOn, onToggle, onRefresh, onSaveCreds }) {
  /** @type {Record<string,{row:HTMLElement,badge:HTMLElement}>} */
  const rows = {};

  for (const f of FEEDS) {
    const row = document.createElement('button');
    row.className = 'track-row';
    row.type = 'button';
    row.setAttribute('role', 'switch');
    row.dataset.feed = f.id;
    row.innerHTML =
      `<span class="tk-glyph">${f.glyph}</span>` +
      `<span class="tk-label">${f.label}</span>` +
      `<span class="tk-badge" data-badge>${f.src}</span>` +
      `<span class="tk-sw" aria-hidden="true"></span>`;
    row.addEventListener('click', () => onToggle(f.id, !isOn(f.id)));
    host.appendChild(row);
    rows[f.id] = { row, badge: row.querySelector('[data-badge]') };
    reflect(f.id);
  }

  function reflect(feed) {
    const r = rows[feed];
    if (!r) return;
    const on = !!isOn(feed);
    r.row.classList.toggle('on', on);
    r.row.setAttribute('aria-checked', String(on));
  }

  /**
   * @param {string} feed
   * @param {{count?:number, mock?:boolean, stale?:boolean, source?:string, busy?:boolean}} s
   */
  function setStatus(feed, s = {}) {
    const r = rows[feed];
    if (!r) return;
    const flag = s.mock ? 'MOCK' : (s.stale ? 'STALE' : (s.source || 'LIVE'));
    r.badge.textContent = s.busy
      ? '…'
      : (s.count != null ? `${s.count} · ${flag}` : flag);
    r.badge.className = 'tk-badge' + (s.mock ? ' mock' : (s.stale ? ' stale' : ' live'));
  }

  refreshBtn?.addEventListener('click', () => onRefresh?.());

  // ---- credential form (local-only unless signed in; see js/auth/auth.js) ----
  const c = creds || {};
  const { idInput, secretInput, aisInput, note } = c;

  /** Repopulate the inputs (e.g. when cloud secrets load after sign-in). */
  function setCreds(next = {}) {
    if (idInput)     idInput.value = next.clientId || '';
    if (secretInput) secretInput.value = next.clientSecret || '';
    if (aisInput)    aisInput.value = next.aisKey || '';
  }

  if (creds) {
    const { saveBtn, clearBtn } = c;
    setCreds(initialCreds);
    const noteSet = (msg) => { if (note) note.textContent = msg; };
    if (initialCreds.clientId || initialCreds.aisKey) noteSet('Saved locally.');

    saveBtn?.addEventListener('click', () => {
      const next = {
        clientId: (idInput?.value || '').trim(),
        clientSecret: (secretInput?.value || '').trim(),
        aisKey: (aisInput?.value || '').trim(),
      };
      onSaveCreds?.(next);
      noteSet('Saved locally · applies on next refresh.');
    });
    clearBtn?.addEventListener('click', () => {
      if (idInput) idInput.value = '';
      if (secretInput) secretInput.value = '';
      if (aisInput) aisInput.value = '';
      onSaveCreds?.({ clientId: '', clientSecret: '', aisKey: '' });
      noteSet('Cleared.');
    });
  }

  return { reflect, setStatus, setCreds };
}
