// ============================================================
//  satelliteProvider.js — orbital tracking (CelesTrak TLE + SGP4)
//  Fetches a capped sample of TLEs from CelesTrak (keyless, CORS-open) and
//  propagates them to lon/lat/alt with satellite.js (SGP4). satellite.js is
//  loaded by DYNAMIC import so a CDN/import-map failure degrades to deterministic
//  mock orbits instead of breaking the whole app. Civilian SA only — no tasking.
// ============================================================

const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle';

// Lazy, fault-tolerant handle to the SGP4 library (bare specifier via import map).
let satLib = null, tried = false;
async function lib() {
  if (tried) return satLib;
  tried = true;
  try { const m = await import('satellite.js'); satLib = m.default || m; }
  catch (_) { satLib = null; }
  return satLib;
}

async function fetchText(url, ms = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally { clearTimeout(timer); }
}

function parseTLE(text, max) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const out = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i].trim(), l1 = lines[i + 1], l2 = lines[i + 2];
    if (!l1.startsWith('1 ') || !l2.startsWith('2 ')) continue;
    out.push({ name, l1, l2 });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Load a capped satellite set (TLEs → SGP4 satrecs).
 * @returns {Promise<{sats:Object[], lib:any, mock:boolean, source:string}>}
 */
export async function fetchSatellites(max = 40) {
  const S = await lib();
  if (S) {
    try {
      const tles = parseTLE(await fetchText(TLE_URL), max);
      const sats = tles
        .map((t) => ({ id: 'sat-' + t.l2.slice(2, 7).trim(), name: t.name, satrec: S.twoline2satrec(t.l1, t.l2) }))
        .filter((s) => s.satrec && !s.satrec.error);
      if (sats.length) return { sats, lib: S, mock: false, source: 'CelesTrak' };
    } catch (_) { /* fall through to mock */ }
  }
  return { sats: mockSats(max), lib: null, mock: true, source: 'Mock Orbits' };
}

/**
 * Propagate a satellite set to ground positions at `date`.
 * @returns {{id,name,lon,lat,altKm}[]}
 */
export function propagateSats({ sats, lib: S }, date = new Date()) {
  if (S) {
    const gmst = S.gstime(date);
    const out = [];
    for (const s of sats) {
      try {
        const pv = S.propagate(s.satrec, date);
        if (!pv || !pv.position) continue;
        const g = S.eciToGeodetic(pv.position, gmst);
        out.push({ id: s.id, name: s.name,
          lon: S.degreesLong(g.longitude), lat: S.degreesLat(g.latitude), altKm: g.height });
      } catch (_) { /* skip a bad satrec */ }
    }
    return out;
  }
  return sats.map((s) => mockPos(s, date));
}

// --- deterministic mock orbits (used when TLEs / SGP4 are unavailable) ---
function mockSats(n) {
  const out = [];
  for (let i = 0; i < Math.min(n, 18); i++) {
    out.push({ id: 'sat-mock-' + i, name: 'SIM-SAT ' + String(i + 1).padStart(2, '0'),
      _incl: 30 + (i * 7) % 60, _periodMin: 90 + i * 3, _phase: (i * 47) % 360, _raan: (i * 53) % 360 });
  }
  return out;
}
function mockPos(s, date) {
  const frac = ((date.getTime() / 1000 / (s._periodMin * 60)) + s._phase / 360) % 1;
  const lon = ((frac * 360 + s._raan + 180) % 360) - 180;
  const lat = s._incl * Math.sin(frac * 2 * Math.PI);
  return { id: s.id, name: s.name, lon, lat, altKm: 550 };
}
