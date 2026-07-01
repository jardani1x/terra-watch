// ============================================================
//  storage.js — namespaced localStorage helpers
//  All Terra-Watch local state (watchlist, breadcrumb trail, preferences)
//  lives under the `tw:` prefix so `clearAll()` can wipe ONLY our keys and
//  leave any other site data on the origin untouched. JSON-safe; every read
//  degrades to a fallback rather than throwing (private-mode / quota / parse).
// ============================================================

const PREFIX = 'tw:';

/** @returns {boolean} whether localStorage is usable on this origin. */
function available() {
  try {
    const k = PREFIX + '__probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (_) {
    return false;
  }
}

const ENABLED = available();

/**
 * Read a namespaced value, parsed from JSON.
 * @template T
 * @param {string} key
 * @param {T} fallback returned on miss / parse error / unavailable storage
 * @returns {T}
 */
export function load(key, fallback) {
  if (!ENABLED) return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

/**
 * Write a namespaced value as JSON. Silent no-op if storage is unavailable.
 * @param {string} key
 * @param {*} value
 */
export function save(key, value) {
  if (!ENABLED) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (_) {
    /* quota / private mode — ignore */
  }
}

/** Remove a single namespaced key. */
export function remove(key) {
  if (!ENABLED) return;
  try {
    localStorage.removeItem(PREFIX + key);
  } catch (_) {}
}

/**
 * Wipe every Terra-Watch key on this origin (the "Clear local data" action).
 * @returns {number} count of keys removed
 */
export function clearAll() {
  if (!ENABLED) return 0;
  let n = 0;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) {
        localStorage.removeItem(k);
        n++;
      }
    }
  } catch (_) {}
  return n;
}

/** @returns {boolean} whether persistence is active (drives the privacy UI text). */
export const persistenceEnabled = () => ENABLED;
