// ============================================================
//  flightProvider.js — live aircraft (ADS-B)
//  Source chain, all civilian situational-awareness only (no tasking):
//    1. airplanes.live — keyless, CORS-open, point+radius (preferred).
//    2. OpenSky /states/all — anonymous bbox; optional runtime OAuth2 creds
//       (from localStorage, never committed) raise the rate limit.
//    3. Mock ADS-B — deterministic fallback so the globe always shows something
//       honest when both live sources fail / rate-limit.
//  Polite cadence is the caller's job (timer only while the layer is on).
// ============================================================

const AL_URL = 'https://api.airplanes.live/v2/point';   // /{lat}/{lon}/{radiusNm}
const STATES_URL = 'https://opensky-network.org/api/states/all';
const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

const FT_TO_KM = 0.0003048;     // feet → km (barometric altitude)
const KT_TO_MS = 0.514444;      // knots → m/s (ground speed)

async function fetchJSON(url, opts = {}, ms = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (res.status === 429) throw new Error('rate-limited');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}

// Convert a [south,west,north,east] bbox to the center point + covering radius
// (nautical miles, capped at the airplanes.live 250 nm limit) for the point API.
function bboxToPointRadius([s, w, n, e]) {
  const lat = (s + n) / 2, lon = (w + e) / 2;
  const latNm = ((n - s) / 2) * 60;
  const lonNm = ((e - w) / 2) * 60 * Math.cos(lat * Math.PI / 180);
  const nm = Math.min(250, Math.max(5, Math.ceil(Math.hypot(latNm, lonNm))));
  return { lat, lon, nm };
}

// --- 1) airplanes.live (keyless, CORS-open) ---
async function fetchAirplanesLive(bbox) {
  const { lat, lon, nm } = bboxToPointRadius(bbox);
  const json = await fetchJSON(`${AL_URL}/${lat.toFixed(4)}/${lon.toFixed(4)}/${nm}`);
  const data = (json.ac || [])
    .filter((a) => a.lat != null && a.lon != null)
    .map((a) => {
      const ground = a.alt_baro === 'ground';
      return {
        id: 'flt-' + a.hex,
        callsign: (a.flight || '').trim() || a.r || a.hex,
        country: undefined, lon: a.lon, lat: a.lat,
        altKm: typeof a.alt_baro === 'number' ? a.alt_baro * FT_TO_KM : 0,
        velocity: a.gs != null ? a.gs * KT_TO_MS : null,
        heading: a.track, onGround: ground, reg: a.r, kind: a.t,
      };
    });
  return { data, mock: false, source: 'airplanes.live' };
}

// Best-effort OpenSky OAuth2 token (client_credentials). CORS may block the
// token endpoint from a browser; on any failure we return null → anonymous.
async function getToken(creds) {
  if (!creds || !creds.clientId || !creds.clientSecret) return null;
  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.clientId, client_secret: creds.clientSecret,
    });
    const res = await fetch(TOKEN_URL, { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!res.ok) return null;
    return (await res.json()).access_token || null;
  } catch (_) { return null; }
}

// --- 2) OpenSky (anonymous bbox, or OAuth2 if creds resolve a token) ---
async function fetchOpenSky(bbox, creds) {
  const [s, w, n, e] = bbox;
  const tk = await getToken(creds);
  const headers = tk ? { Authorization: 'Bearer ' + tk } : {};
  const json = await fetchJSON(`${STATES_URL}?lamin=${s}&lomin=${w}&lamax=${n}&lomax=${e}`, { headers });
  const data = (json.states || []).map((st) => ({
    id: 'flt-' + st[0],
    callsign: (st[1] || '').trim() || st[0],
    country: st[2], lon: st[5], lat: st[6],
    altKm: (st[7] || 0) / 1000, velocity: st[9], heading: st[10], onGround: st[8],
  })).filter((f) => f.lon != null && f.lat != null);
  return { data, mock: false, source: tk ? 'OpenSky (auth)' : 'OpenSky (anon)' };
}

/**
 * Aircraft within a bbox, trying live sources in order, mock as last resort.
 * @param {[number,number,number,number]} bbox [south, west, north, east]
 * @param {{clientId?:string,clientSecret?:string}} [creds]
 * @returns {Promise<{data:Object[], mock:boolean, source:string}>}
 */
export async function fetchFlights(bbox, creds) {
  try { return await fetchAirplanesLive(bbox); } catch (_) { /* try next */ }
  try { return await fetchOpenSky(bbox, creds); } catch (_) { /* fall back */ }
  return { data: mockFlights(bbox), mock: true, source: 'Mock ADS-B' };
}

function mockFlights(bbox) {
  const [s, w, n, e] = bbox;
  let seed = Math.floor((s + e) * 997) || 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const out = [];
  const k = 4 + Math.floor(rnd() * 5);
  for (let i = 0; i < k; i++) {
    out.push({ id: 'flt-mock-' + i, callsign: 'SIM' + (100 + Math.floor(rnd() * 900)),
      country: 'SIMLAND', lon: w + rnd() * (e - w), lat: s + rnd() * (n - s),
      altKm: 8 + rnd() * 4, velocity: 180 + rnd() * 80, heading: rnd() * 360, onGround: false });
  }
  return out;
}
