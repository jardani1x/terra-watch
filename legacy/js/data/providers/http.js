// ============================================================
//  http.js — fetch JSON with a hard timeout
//  Public APIs can hang or throttle; without a timeout a single slow request
//  freezes the whole feed (Promise.all never settles). AbortController bounds
//  every provider request so callers reliably fall back to mock data.
// ============================================================

/**
 * @param {string} url
 * @param {number} [ms] abort after this many milliseconds
 * @returns {Promise<any>} parsed JSON
 */
export async function fetchJSON(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
