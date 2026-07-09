// ============================================================
//  selection.js — the selection bus (pure, framework-free)
//  One source of truth for "what entity is currently selected", by stable id.
//  Globe markers, the market feed, the inspector's linked-entity links, and the
//  Phase-2 graph all publish to it via select(id) and react to it via
//  subscribe(cb). No DOM, no Three.js — just a tiny observable holding an id.
// ============================================================

/**
 * @typedef {Object} Selection
 * @property {(id: string|null) => void} select   set the current id and notify
 * @property {() => string|null} current          the current id (or null)
 * @property {(cb: (id: string|null) => void) => (() => void)} subscribe
 *           register a listener; returns an unsubscribe fn
 * @property {() => void} clear                    deselect (notify with null)
 */

/** Create an isolated selection bus. @returns {Selection} */
export function createSelection() {
  let currentId = null;
  /** @type {Set<(id: string|null) => void>} */
  const subscribers = new Set();

  function notify(id) {
    // Snapshot so a listener that (un)subscribes mid-dispatch can't disturb it.
    for (const cb of [...subscribers]) {
      try { cb(id); } catch (_) { /* one bad listener must not break the rest */ }
    }
  }

  // Re-selecting the same id still notifies, so re-clicking a marker re-focuses.
  function select(id) {
    currentId = id ?? null;
    notify(currentId);
  }

  function subscribe(cb) {
    subscribers.add(cb);
    return () => subscribers.delete(cb);
  }

  return {
    select,
    current: () => currentId,
    subscribe,
    // Clearing when already clear is a no-op, so a subscriber that hides UI on
    // null (which may re-enter clear) can't loop. Re-selecting a non-null id
    // still re-notifies (so re-clicking a marker re-focuses).
    clear: () => { if (currentId !== null) select(null); },
  };
}
