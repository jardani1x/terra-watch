// ============================================================
//  vesselProvider.js — surface vessels (AIS)
//  Live AIS isn't available as a keyless CORS-open REST feed — it's delivered
//  over authenticated streams. Two paths, civilian situational-awareness only:
//    • streamVessels(): real AIS via AISStream.io (free key) over a WebSocket.
//      WebSockets aren't CORS-bound, so this works from a static page. Reports
//      are pushed continuously; the caller accumulates + redraws on a throttle.
//    • fetchVessels(): deterministic MOCK for the no-key path (and a stated
//      fallback if the stream is rejected). Stays honest about being simulated.
// ============================================================

const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';

/**
 * Mock vessels within a bbox (no key / fallback path).
 * @param {[number,number,number,number]} bbox [south, west, north, east]
 * @param {string} [aisKey]
 * @returns {Promise<{data:Object[], mock:boolean, source:string}>}
 */
export async function fetchVessels(bbox, aisKey) {
  return {
    data: mockVessels(bbox),
    mock: true,
    source: aisKey ? 'AIS key rejected · mock' : 'Mock AIS',
  };
}

/**
 * Open a live AIS position stream (AISStream.io) for a bbox. Push model: each
 * PositionReport is handed to onReport; status transitions go to onStatus.
 * Auto-reconnects with backoff on transient drops, but NOT on an auth/error
 * frame (so a bad key fails fast instead of hammering the endpoint).
 * @param {Object} o
 * @param {[number,number,number,number]} o.bbox [south, west, north, east]
 * @param {string} o.key                          AISStream API key (local-only)
 * @param {(v:Object)=>void} o.onReport
 * @param {(s:{open?:boolean,error?:boolean,message?:string,source?:string})=>void} [o.onStatus]
 * @returns {{close:()=>void}}
 */
export function streamVessels({ bbox, key, onReport, onStatus }) {
  const [s, w, n, e] = bbox;
  let ws = null, closed = false, fatal = false, retry = 0, timer = null;

  function open() {
    if (closed) return;
    try { ws = new WebSocket(AISSTREAM_URL); }
    catch (_) { onStatus?.({ error: true, message: 'WebSocket unavailable' }); return; }

    ws.onopen = () => {
      retry = 0;
      ws.send(JSON.stringify({
        APIKey: key,
        BoundingBoxes: [[[s, w], [n, e]]],
        FilterMessageTypes: ['PositionReport'],
      }));
      onStatus?.({ open: true, source: 'AISStream' });
    };

    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m && m.error) { fatal = true; onStatus?.({ error: true, message: String(m.error) }); try { ws.close(); } catch (_) {} return; }
      if (!m || m.MessageType !== 'PositionReport') return;
      const md = m.MetaData || {};
      const pr = (m.Message && m.Message.PositionReport) || {};
      const lat = md.latitude ?? pr.Latitude, lon = md.longitude ?? pr.Longitude;
      if (lat == null || lon == null) return;
      const mmsi = md.MMSI ?? pr.UserID;
      onReport?.({
        id: 'vsl-' + (mmsi ?? Math.random().toString(36).slice(2)),
        mmsi, name: (md.ShipName || '').trim() || ('MMSI ' + (mmsi ?? '?')),
        lon, lat, course: pr.Cog, speedKn: pr.Sog, heading: pr.TrueHeading,
        t: md.time_utc ? Date.parse(md.time_utc) : Date.now(),
      });
    };

    ws.onerror = () => { onStatus?.({ error: true, message: 'stream error' }); };
    ws.onclose = () => { if (!closed && !fatal) reconnect(); };
  }

  function reconnect() {
    retry = Math.min(retry + 1, 5);
    timer = setTimeout(open, 1000 * retry);
  }

  open();
  return { close() { closed = true; if (timer) clearTimeout(timer); try { ws && ws.close(); } catch (_) {} } };
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
