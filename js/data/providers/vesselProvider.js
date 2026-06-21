// ============================================================
//  vesselProvider.js — surface vessels (AIS)
//  There is no keyless, CORS-open, REST AIS feed: live AIS is delivered over
//  authenticated streaming endpoints. So this provider is MOCK by default and
//  stays honest about it — even when an AIS key is present we surface mock data
//  and say so, until a concrete streaming endpoint is wired. Civilian SA only.
// ============================================================

/**
 * Vessels within a bbox.
 * @param {[number,number,number,number]} bbox [south, west, north, east]
 * @param {string} [aisKey] runtime AIS key (localStorage; never committed)
 * @returns {Promise<{data:Object[], mock:boolean, source:string}>}
 */
export async function fetchVessels(bbox, aisKey) {
  // A keyed streaming integration would go here; until one is configured we are
  // explicit that the output is simulated rather than pretending it is live.
  return {
    data: mockVessels(bbox),
    mock: true,
    source: aisKey ? 'AIS key set · mock (no stream endpoint)' : 'Mock AIS',
  };
}

const TYPES = ['Cargo', 'Tanker', 'Passenger', 'Fishing', 'Tug'];

function mockVessels(bbox) {
  const [s, w, n, e] = bbox;
  let seed = Math.floor((w + n) * 733) || 13;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const out = [];
  const k = 3 + Math.floor(rnd() * 5);
  for (let i = 0; i < k; i++) {
    out.push({ id: 'vsl-mock-' + i, name: 'MV SIM-' + String(i + 1).padStart(2, '0'),
      type: TYPES[Math.floor(rnd() * TYPES.length)],
      lon: w + rnd() * (e - w), lat: s + rnd() * (n - s),
      course: rnd() * 360, speedKn: 4 + rnd() * 16 });
  }
  return out;
}
