// ============================================================
//  flightProvider.js — live aircraft (OpenSky Network /states/all)
//  Anonymous bbox query, keyless. Optional OAuth2 client-credentials (runtime,
//  from localStorage — never committed) raises the rate limit. Polite cadence is
//  the caller's job (timer only while the layer is on). Any failure / HTTP 429
//  falls back to mock ADS-B so the globe always shows something honest.
//  Civilian situational-awareness only — no tasking / interception semantics.
// ============================================================

const STATES_URL = 'https://opensky-network.org/api/states/all';
const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

// Best-effort OAuth2 token (client_credentials). CORS may block the token
// endpoint from a browser; on any failure we simply return null → anonymous.
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

/**
 * Aircraft within a bbox.
 * @param {[number,number,number,number]} bbox [south, west, north, east]
 * @param {{clientId?:string,clientSecret?:string}} [creds]
 * @returns {Promise<{data:Object[], mock:boolean, source:string}>}
 */
export async function fetchFlights(bbox, creds) {
  const [s, w, n, e] = bbox;
  const url = `${STATES_URL}?lamin=${s}&lomin=${w}&lamax=${n}&lomax=${e}`;
  try {
    const headers = {};
    const tk = await getToken(creds);
    if (tk) headers.Authorization = 'Bearer ' + tk;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let res;
    try { res = await fetch(url, { signal: ctrl.signal, headers }); }
    finally { clearTimeout(timer); }

    if (res.status === 429) throw new Error('rate-limited');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const data = (json.states || []).map((st) => ({
      id: 'flt-' + st[0],
      callsign: (st[1] || '').trim() || st[0],
      country: st[2], lon: st[5], lat: st[6],
      altKm: (st[7] || 0) / 1000, velocity: st[9], heading: st[10], onGround: st[8],
    })).filter((f) => f.lon != null && f.lat != null);
    return { data, mock: false, source: tk ? 'OpenSky (auth)' : 'OpenSky (anon)' };
  } catch (_) {
    return { data: mockFlights(bbox), mock: true, source: 'Mock ADS-B' };
  }
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
