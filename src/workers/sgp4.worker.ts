// SGP4 propagation worker — the repo's first Web Worker. Keeps ~16k
// propagations per tick off the main thread; satellite.js is imported ONLY
// here so it lands in the worker's own lazy chunk, not the app bundle.
import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLong, degreesLat, type SatRec } from 'satellite.js';
import type { TleSet } from '../lib/providers/celestrak';

type InMsg = { type: 'init'; sats: TleSet[] } | { type: 'tick'; now: number };

// typed facade over the worker global (tsconfig carries the DOM lib, whose
// `self.postMessage` signature lacks the transfer-list overload)
const ctx = self as unknown as {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<InMsg>) => void) | null;
};

let recs: SatRec[] = [];

ctx.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    recs = [];
    const names: string[] = [];
    const ids: string[] = [];
    const periods: number[] = [];
    for (const s of msg.sats) {
      try {
        const rec = twoline2satrec(s.l1, s.l2);
        recs.push(rec);
        names.push(s.name);
        ids.push(String(rec.satnum));
        // satrec.no is mean motion in radians/minute → period in minutes;
        // degenerate mean motion (near-zero/NaN) would divide out to
        // Infinity/NaN — push 0 (treated as absent) rather than a garbage value
        const period = Math.round((2 * Math.PI) / rec.no);
        periods.push(Number.isFinite(period) ? period : 0);
      } catch { /* malformed element set — skip */ }
    }
    ctx.postMessage({ type: 'ready', count: recs.length, names, ids, periods });
    return;
  }
  // tick: propagate everything at one instant; NaN row = decayed/failed
  const date = new Date(msg.now);
  const gmst = gstime(date);
  const out = new Float64Array(recs.length * 3);
  for (let i = 0; i < recs.length; i++) {
    let lon = NaN, lat = NaN, alt = NaN;
    try {
      const pv = propagate(recs[i], date);
      if (pv && typeof pv.position === 'object') {
        const geo = eciToGeodetic(pv.position, gmst);
        lon = degreesLong(geo.longitude);
        lat = degreesLat(geo.latitude);
        alt = geo.height;
      }
    } catch { /* propagation failure → NaN row */ }
    out[i * 3] = lon; out[i * 3 + 1] = lat; out[i * 3 + 2] = alt;
  }
  ctx.postMessage({ type: 'positions', buf: out.buffer }, [out.buffer]);
};
