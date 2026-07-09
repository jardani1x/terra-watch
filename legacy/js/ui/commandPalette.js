// ============================================================
//  commandPalette.js — Ctrl/Cmd+K command launcher
//  A developer-tools-style palette: open with the keyboard (or a button),
//  type to fuzzy-filter, ↑/↓ to move, Enter to run, Esc to close. Commands are
//  supplied by the orchestrator via getCommands() so their labels reflect live
//  state (e.g. "Toggle weather layer" shows current on/off).
// ============================================================

/**
 * @typedef {Object} Command
 * @property {string} id
 * @property {string} title
 * @property {string} [hint]   right-aligned hint / current state
 * @property {string} [group]
 * @property {()=>void} run
 */

/** Subsequence fuzzy match — returns a score (higher = better) or -1. */
function score(query, text) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0) return 100 - idx; // contiguous match ranks highest
  let qi = 0, s = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) { qi++; s++; }
  }
  return qi === q.length ? s : -1;
}

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.root   the overlay (#cmdk)
 * @param {HTMLInputElement} opts.input
 * @param {HTMLElement} opts.list
 * @param {()=>Command[]} opts.getCommands
 */
export function initCommandPalette({ root, input, list, getCommands }) {
  let open = false;
  let active = 0;
  /** @type {Command[]} */
  let view = [];

  function render() {
    const q = input.value.trim();
    const cmds = getCommands();
    view = cmds
      .map((c) => ({ c, s: score(q, c.title + ' ' + (c.group || '')) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
    if (active >= view.length) active = Math.max(0, view.length - 1);

    list.innerHTML = view.length
      ? view.map((c, i) =>
          `<li class="cmd-item${i === active ? ' active' : ''}" data-i="${i}" role="option" aria-selected="${i === active}">
             <span class="cmd-title">${c.title}</span>
             ${c.hint ? `<span class="cmd-hint">${c.hint}</span>` : ''}
           </li>`).join('')
      : '<li class="cmd-empty">No matching command</li>';
  }

  function show() {
    open = true;
    root.removeAttribute('hidden');
    input.value = '';
    active = 0;
    render();
    setTimeout(() => input.focus(), 0);
  }
  function hide() {
    open = false;
    root.setAttribute('hidden', '');
  }
  function run(i) {
    const c = view[i];
    if (!c) return;
    hide();
    try { c.run(); } catch (e) { console.error('[cmd]', c.id, e); }
  }

  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(view.length - 1, active + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(active); }
    else if (e.key === 'Escape') { e.preventDefault(); hide(); }
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('.cmd-item');
    if (li) run(+li.dataset.i);
  });
  root.addEventListener('click', (e) => { if (e.target === root) hide(); });

  // Global hotkey: Ctrl/Cmd+K toggles.
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      open ? hide() : show();
    }
  });

  return { open: show, close: hide, toggle: () => (open ? hide() : show()), get isOpen() { return open; } };
}
