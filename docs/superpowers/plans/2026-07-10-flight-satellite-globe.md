# Flight Tracker, Satellite Tracker, Globe Auto-Orient Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live in-view aircraft layer (airplanes.live), all-active-catalog satellite overlay (CelesTrak TLE + SGP4 worker), and one-time globe orient to the user's GPS/timezone longitude on entering 3D.

**Architecture:** Aircraft ride the existing GeoEvent/layer pipeline as `reference:true` position snapshots using the military-bases in-view pattern. Satellites bypass the store's events entirely: a Web Worker propagates ~16k satrecs every 2 s and feeds a dedicated MapLibre GeoJSON source. Globe orient is a pure helper called from the existing `[projection]` effect.

**Tech Stack:** React 18 + TypeScript (strict) + Vite, MapLibre GL 5, Zustand 5, satellite.js 7 (new dep, worker-only), Playwright e2e.

Spec: `docs/superpowers/specs/2026-07-10-flight-satellite-globe-design.md`

## Global Constraints

- Repo: `~/Documents/global/terra-watch`, branch `main`. Verify each task with `npm run build` (tsc strict + vite) before its test step.
- **Never fake "live"**: provider `status` comes from real fetch results. NO mock fallback for either new provider — failure = `offline` + error text (policy: `src/lib/providers/overpass.ts:6-9`).
- Aircraft and satellites are **`reference: true`** / non-events — never in timeline, playback, snapshots, or signals.
- Satellite positions are **computed predictions** — inspector copy must say "propagated from TLE epoch (SGP4)", never presented as observed telemetry.
- Keyless only; no keys, no proxies. Probed 2026-07-10: both endpoints send `Access-Control-Allow-Origin: *`.
- E2E runs need a preview server: `npm run build && npx vite preview --port 4173 &` (kill it when done). Slow-hardware timeouts are the norm here (`test.setTimeout(90_000)`+).
- This repo has no unit-test framework — verification is typecheck + build + Playwright (repo convention since Slice 1).
- Commit messages follow repo style: `Feat: ...` / `Docs: ...` one-liners.

---

### Task 1: Globe orient on entering 3D

**Files:**
- Create: `src/lib/orient.ts`
- Modify: `src/components/MapCanvas.tsx` (load handler ~line 209, `[projection]` effect ~line 514)
- Test: `tests/smoke.spec.ts` (append)

**Interfaces:**
- Consumes: `useStore.getState().geo.pos` (`{lat,lon,accuracy}|null`, `src/state/store.ts:92-96`), `prefersReducedMotion()` (`src/lib/a11y.ts`).
- Produces: `homePosition(pos, offsetMinutes?) => {lon:number; lat:number}` — exported pure function.

- [ ] **Step 1: Create `src/lib/orient.ts`**

```ts
/** Where "home" is for the 3D globe orient: the user's own GPS fix when the
 *  opt-in locate watch has one, else a longitude estimated from the browser
 *  timezone (UTC offset × 15°/hour). 20°N default latitude keeps the
 *  populated mid-latitudes in view. Pure; no network, nothing persisted. */
export function homePosition(
  pos: { lat: number; lon: number } | null,
  offsetMinutes: number = new Date().getTimezoneOffset(),
): { lon: number; lat: number } {
  if (pos) return { lon: pos.lon, lat: pos.lat };
  // getTimezoneOffset() is minutes *west* of UTC (UTC+8 → -480), so negate;
  // clamp — some historical zones exceed ±12 h
  const lon = Math.max(-180, Math.min(180, (-offsetMinutes / 60) * 15));
  return { lon, lat: 20 };
}
```

- [ ] **Step 2: Wire into MapCanvas**

Add import at top of `src/components/MapCanvas.tsx`:

```ts
import { homePosition } from '../lib/orient';
```

Add a module-level helper just below the `alive()` function (~line 99):

```ts
/** Entering 3D orients the globe to the user: GPS fix if the locate watch
 *  has one, else the browser-timezone longitude. One-shot per switch — the
 *  user keeps full manual control afterwards. Zoom is left untouched. */
function orientGlobe(map: maplibregl.Map) {
  const home = homePosition(useStore.getState().geo.pos);
  const cam = { center: [home.lon, home.lat] as [number, number] };
  if (prefersReducedMotion()) map.jumpTo(cam);
  else map.easeTo({ ...cam, duration: 1200, essential: true });
}
```

In the `map.on('load', ...)` handler, replace (currently ~line 209):

```ts
      if (st.projection === '3d') map.setProjection({ type: 'globe' });
```

with:

```ts
      if (st.projection === '3d') {
        map.setProjection({ type: 'globe' });
        orientGlobe(map);
      }
```

In the `[projection]` effect (~line 514), replace:

```ts
    map.setProjection({ type: projection === '3d' ? 'globe' : 'mercator' });
```

with:

```ts
    map.setProjection({ type: projection === '3d' ? 'globe' : 'mercator' });
    if (projection === '3d') orientGlobe(map);
```

(The effect is guarded by `readyRef`, so the initial mount run before map
load is already a no-op; the load handler covers the persisted-3D case.)

- [ ] **Step 3: Typecheck + build**

Run: `npm run build`
Expected: exits 0, no tsc errors.

- [ ] **Step 4: Add Playwright test**

Append to `tests/smoke.spec.ts`:

```ts
test.describe('globe orient', () => {
  // fixed timezone so the expected longitude is deterministic:
  // Asia/Singapore = UTC+8 → 8 × 15 = 120°E
  test.use({ timezoneId: 'Asia/Singapore' });

  test('entering 3D orients the globe to the timezone longitude', async ({ page }) => {
    test.setTimeout(90_000); // globe projection switch is slow on software GL
    await page.goto('/');
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: '3D globe view' }).click();
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const m = (window as unknown as { __terraMap: { getCenter(): { lng: number } } }).__terraMap;
            return Math.abs(m.getCenter().lng - 120);
          }),
        { timeout: 30_000 },
      )
      .toBeLessThan(1);
    // leave state clean for later tests (projection persists)
    await page.getByRole('button', { name: '2D map view' }).click();
  });
});
```

- [ ] **Step 5: Run the test**

```bash
npx vite preview --port 4173 &
npx playwright test -g "globe orient"
```
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/orient.ts src/components/MapCanvas.tsx tests/smoke.spec.ts
git commit -m "Feat: 3D globe orients to GPS fix or timezone longitude on entry"
```

---

### Task 2: ✈ Aviation layer (airplanes.live)

**Files:**
- Create: `src/lib/providers/aviation.ts`
- Modify: `src/state/store.ts` (imports, `DEFAULT_LAYERS`, providers stub, sources, `AppState`, new action), `src/components/MapCanvas.tsx` (two effects next to the military debounce ~line 234), `src/components/InspectorRail.tsx` (`LABELS` ~line 9)
- Test: `tests/smoke.spec.ts` (append)

**Interfaces:**
- Consumes: `FetchResult`/`GeoEvent` (`src/lib/providers/types.ts`), `viewBounds` `[W,S,E,N]`, `refreshMilitary` pattern (`store.ts:441-474`).
- Produces: `AVIATION_META = { id: 'airplanes-live', name: 'Aircraft (airplanes.live)', license, homepage }`; `fetchAircraft(bbox: [s,w,n,e], signal?) => Promise<FetchResult>`; store action `refreshAviation(): Promise<void>`; layer id `'aviation'`, layer name `'Aircraft (live ADS-B)'`.

- [ ] **Step 1: Create `src/lib/providers/aviation.ts`**

```ts
import type { FetchResult, GeoEvent } from './types';

// airplanes.live community ADS-B feed. Keyless, CORS `*` (verified live
// 2026-07-10). In-view point query (radius ≤ 250 nm), default-off layer.
//
// Honesty note: NO mock fallback — fabricated aircraft positions, even
// labeled SAMPLE, would be worse than an honest OFFLINE badge (same policy
// as overpass.ts).

export const AVIATION_META = {
  id: 'airplanes-live',
  name: 'Aircraft (airplanes.live)',
  license: 'airplanes.live community ADS-B feed · free non-commercial use',
  homepage: 'https://airplanes.live/rest-api-adsb-data-field-descriptions/',
};

interface ApAircraft {
  hex: string;
  flight?: string;
  r?: string;
  t?: string;
  desc?: string;
  alt_baro?: number | string; // number ft, or the literal string "ground"
  gs?: number;
  track?: number;
  squawk?: string;
  lat?: number;
  lon?: number;
}

const EARTH_KM = 6371;
const NM_PER_KM = 0.539957;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

/** Aircraft currently inside [south, west, north, east], approximated as the
 *  circumscribed circle around the view center (the API is point+radius),
 *  capped at the API's 250 nm maximum. */
export async function fetchAircraft(bbox: [number, number, number, number], signal?: AbortSignal): Promise<FetchResult> {
  const started = performance.now();
  const [s, w, n, e] = bbox;
  const lat = (s + n) / 2;
  const lon = (w + e) / 2;
  const radiusNm = Math.min(250, Math.max(1, Math.ceil(haversineKm(lat, lon, n, e) * NM_PER_KM)));
  try {
    const res = await fetch(`https://api.airplanes.live/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${radiusNm}`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { ac?: ApAircraft[] };
    const now = Date.now();
    const events: GeoEvent[] = [];
    for (const a of json.ac ?? []) {
      if (a.lat == null || a.lon == null) continue;
      const callsign = a.flight?.trim() || undefined;
      events.push({
        id: `airplanes-live:${a.hex}`,
        type: 'aircraft',
        category: 'Aircraft (ADS-B)',
        lon: a.lon,
        lat: a.lat,
        title: callsign ?? a.r ?? a.hex,
        time: now,
        // a position snapshot, not an event: excluded from timeline/playback/signals
        reference: true,
        sourceId: AVIATION_META.id,
        props: {
          callsign, registration: a.r, aircraftType: a.t, desc: a.desc,
          altitudeFt: a.alt_baro, speedKt: a.gs, track: a.track, squawk: a.squawk,
        },
      });
    }
    return { events, mode: 'live', latencyMs: Math.round(performance.now() - started), error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { events: [], mode: 'offline', latencyMs: Math.round(performance.now() - started), error: err instanceof Error ? err.message : 'fetch failed' };
  }
}
```

- [ ] **Step 2: Register in `src/state/store.ts`**

Add import (next to the overpass import, ~line 15):

```ts
import { fetchAircraft, AVIATION_META } from '../lib/providers/aviation';
```

Append to `DEFAULT_LAYERS` (after the military-bases row, ~line 241):

```ts
  // default OFF: in-view airplanes.live query only runs when the user opts in
  { id: 'aviation', name: 'Aircraft (live ADS-B)', group: '✈ Transport', enabled: false, providerId: 'airplanes-live', eventTypes: ['aircraft'], color: '#7ec8ff' },
```

Add to the `providers:` init object (~line 266): `'airplanes-live': providerStub(AVIATION_META),`
Add to the `sources:` init object (~line 271): `'airplanes-live': true,`
Do **NOT** add to `FETCHERS` — in-view driven, like `osm-military`.

Add to the `AppState` interface (next to `refreshMilitary`, ~line 184):

```ts
  /** in-view airplanes.live aircraft refresh (only when its layer is on) */
  refreshAviation: () => Promise<void>;
```

Add the action implementation (directly after `refreshMilitary`, ~line 474):

```ts
      refreshAviation: async () => {
        const { viewBounds, layers, sources, providers } = get();
        if (!(sources[AVIATION_META.id] ?? true)) return;
        if (!layers.some((l) => l.providerId === AVIATION_META.id && l.enabled)) return;
        if (!viewBounds) return;
        const [w, s, e, n] = viewBounds;
        if (e - w > 12 || n - s > 8) {
          // the API is point+radius capped at 250 nm — a wider view would
          // silently show only the center chunk; an honest error beats that
          set((st) => ({
            providers: {
              ...st.providers,
              [AVIATION_META.id]: { ...st.providers[AVIATION_META.id], status: 'offline', itemCount: 0, error: 'view too wide — zoom in to load aircraft' },
            },
          }));
          return;
        }
        if (providers[AVIATION_META.id].status === 'loading') return; // one in-flight query at a time
        set((st) => ({
          providers: { ...st.providers, [AVIATION_META.id]: { ...st.providers[AVIATION_META.id], status: 'loading' } },
        }));
        const r = await fetchAircraft([s, w, n, e]);
        set((st) => ({
          events: [...st.events.filter((ev) => ev.sourceId !== AVIATION_META.id), ...r.events],
          providers: {
            ...st.providers,
            [AVIATION_META.id]: {
              ...st.providers[AVIATION_META.id],
              status: r.mode, latencyMs: r.latencyMs, itemCount: r.events.length, error: r.error,
              lastSuccessAt: r.mode === 'live' ? Date.now() : st.providers[AVIATION_META.id].lastSuccessAt,
            },
          },
        }));
      },
```

- [ ] **Step 3: MapCanvas refresh effects**

In `src/components/MapCanvas.tsx`, directly below the military debounce
effect (~line 239), add:

```ts
  // in-view airplanes.live aircraft refresh: same debounce pattern as the
  // military layer — no query without opt-in
  const aviationOn = layers.some((l) => l.id === 'aviation' && l.enabled);
  useEffect(() => {
    if (!aviationOn) return;
    const t = setTimeout(() => { void useStore.getState().refreshAviation(); }, 1200);
    return () => clearTimeout(t);
  }, [aviationOn, viewBounds]);

  // aircraft move ~7 km/min — re-poll every 20 s while enabled (well under
  // the API's ~1 req/s guidance); paused while the tab is hidden
  useEffect(() => {
    if (!aviationOn) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      void useStore.getState().refreshAviation();
    }, 20_000);
    return () => clearInterval(t);
  }, [aviationOn]);
```

- [ ] **Step 4: Inspector labels**

In `src/components/InspectorRail.tsx`, extend `LABELS` (~line 9):

```ts
  callsign: 'Callsign',
  registration: 'Registration',
  aircraftType: 'Type',
  desc: 'Aircraft',
  altitudeFt: 'Altitude (ft)',
  speedKt: 'Ground speed (kt)',
  track: 'Track (°)',
  squawk: 'Squawk',
```

- [ ] **Step 5: Typecheck + build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Add Playwright test**

Append to `tests/smoke.spec.ts` (mirror of the military test at ~line 1040):

```ts
test('aviation layer is opt-in and refuses a world-sized query honestly', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
  const checkbox = page.getByRole('checkbox', { name: 'Aircraft (live ADS-B)', exact: true });
  // default OFF — no airplanes.live query without opt-in
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  // at the default world view the bbox guard reports an honest offline error
  const chip = page.locator('.health-chip', { hasText: 'Aircraft (airplanes.live)' });
  await expect(chip).toContainText(/offline/i, { timeout: 15000 });
});
```

- [ ] **Step 7: Run the test**

```bash
npm run build
npx playwright test -g "aviation layer"
```
Expected: 1 passed (preview server from Task 1 still running).

- [ ] **Step 8: Commit**

```bash
git add src/lib/providers/aviation.ts src/state/store.ts src/components/MapCanvas.tsx src/components/InspectorRail.tsx tests/smoke.spec.ts
git commit -m "Feat: opt-in live aircraft layer via airplanes.live in-view feed"
```

---

### Task 3: 🛰 Satellites — TLE provider, SGP4 worker, store + toggle row

**Files:**
- Create: `src/lib/providers/celestrak.ts`, `src/workers/sgp4.worker.ts`
- Modify: `package.json` (dep), `src/state/store.ts` (`derivedLayers`, `satTles`, `loadSatellites`), `src/components/LayerManager.tsx` (`DerivedKey`, `DERIVED_ROWS`)

**Interfaces:**
- Produces: `CELESTRAK_META = { id: 'celestrak', name: 'Satellites (CelesTrak)', license, homepage }`; `TleSet {name,l1,l2}`; `fetchTles(signal?) => Promise<{sats: TleSet[]; mode; latencyMs; error}>`; worker protocol `{type:'init',sats}` → `{type:'ready',count,names,ids,periods}` (periods = orbital minutes per object, from mean motion) and `{type:'tick',now}` → `{type:'positions',buf:ArrayBuffer}` (Float64Array `[lon,lat,altKm]×N`, NaN row = decayed/failed); store: `derivedLayers.satellites: boolean`, `satTles: TleSet[] | null` (transient), `loadSatellites(): Promise<void>`.
- Task 4 consumes all of the above.

- [ ] **Step 1: Install satellite.js**

Run: `npm install satellite.js@^7.0.1`
Expected: added to `dependencies` in package.json, install clean.

- [ ] **Step 2: Create `src/lib/providers/celestrak.ts`**

```ts
import type { DataMode } from './types';

// CelesTrak GP element sets — the standard public source of orbital elements
// (Dr. T.S. Kelso). Keyless, CORS `*` (verified live 2026-07-10; the active
// group was 2.69 MB / 15,985 objects). Fetched once per session on toggle-on;
// TLEs stay useful for days, so there is no periodic re-fetch.
//
// Positions rendered from this data are SGP4 *propagations* — computed
// predictions from the TLE epoch, never observed telemetry. Every surface
// showing them must say so.
//
// Honesty note: NO mock fallback — failure returns empty + offline.

export const CELESTRAK_META = {
  id: 'celestrak',
  name: 'Satellites (CelesTrak)',
  license: 'CelesTrak GP element sets (celestrak.org) · public orbital data',
  homepage: 'https://celestrak.org/NORAD/elements/',
};

export interface TleSet { name: string; l1: string; l2: string }

export interface TleResult { sats: TleSet[]; mode: DataMode; latencyMs: number; error: string | null }

const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';

/** Parse classic 3-line TLE text (name / line 1 / line 2). */
export function parseTles(text: string): TleSet[] {
  const lines = text.split(/\r?\n/);
  const sats: TleSet[] = [];
  for (let i = 0; i + 2 < lines.length; i++) {
    if (lines[i + 1]?.startsWith('1 ') && lines[i + 2]?.startsWith('2 ')) {
      sats.push({ name: lines[i].trim(), l1: lines[i + 1], l2: lines[i + 2] });
      i += 2;
    }
  }
  return sats;
}

export async function fetchTles(signal?: AbortSignal): Promise<TleResult> {
  const started = performance.now();
  try {
    const res = await fetch(TLE_URL, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const sats = parseTles(await res.text());
    if (sats.length === 0) throw new Error('no TLE sets in response');
    return { sats, mode: 'live', latencyMs: Math.round(performance.now() - started), error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { sats: [], mode: 'offline', latencyMs: Math.round(performance.now() - started), error: err instanceof Error ? err.message : 'fetch failed' };
  }
}
```

- [ ] **Step 3: Create `src/workers/sgp4.worker.ts`**

```ts
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
        // satrec.no is mean motion in radians/minute → period in minutes
        periods.push(Math.round((2 * Math.PI) / rec.no));
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
```

(If `satellite.js` v7's `propagate` return type differs — some versions type
`position` as `EciVec3<Kilometer> | boolean` — the `typeof pv.position ===
'object'` narrowing above already handles it; adjust the null-check only if
tsc complains, without weakening it.)

- [ ] **Step 4: Store wiring in `src/state/store.ts`**

Add import: `import { fetchTles, CELESTRAK_META, type TleSet } from '../lib/providers/celestrak';`

Extend `derivedLayers` — three places:

1. `AppState` interface (~line 130):

```ts
  derivedLayers: { hotspots: boolean; chokepoints: boolean; tradeRoutes: boolean; instability: boolean; sanctions: boolean; satellites: boolean };
  toggleDerived: (key: 'hotspots' | 'chokepoints' | 'tradeRoutes' | 'instability' | 'sanctions' | 'satellites') => void;
```

2. Initial state (~line 285): add `satellites: false` to the `derivedLayers` object.
3. The persisted `merge()` already spreads `derivedLayers` over current defaults (`store.ts:776`) — no change needed there.

Add transient TLE state + action. Interface (~near `refreshAviation`):

```ts
  /** parsed CelesTrak TLE sets; loaded once per session on toggle-on, never persisted */
  satTles: TleSet[] | null;
  loadSatellites: () => Promise<void>;
```

Initial state: `satTles: null,`

Action implementation (after `refreshAviation`):

```ts
      loadSatellites: async () => {
        const { satTles, providers } = get();
        if (satTles) return; // TLEs stay useful for days — one fetch per session
        if (providers[CELESTRAK_META.id]?.status === 'loading') return;
        set((st) => ({
          providers: {
            ...st.providers,
            [CELESTRAK_META.id]: {
              id: CELESTRAK_META.id, name: CELESTRAK_META.name, status: 'loading',
              lastSuccessAt: null, latencyMs: null, itemCount: null, error: null,
              license: CELESTRAK_META.license, homepage: CELESTRAK_META.homepage,
            },
          },
        }));
        const r = await fetchTles();
        set((st) => ({
          satTles: r.sats.length > 0 ? r.sats : null,
          providers: {
            ...st.providers,
            [CELESTRAK_META.id]: {
              ...st.providers[CELESTRAK_META.id],
              status: r.mode, latencyMs: r.latencyMs,
              itemCount: r.sats.length > 0 ? r.sats.length : null,
              error: r.error,
              lastSuccessAt: r.mode === 'live' ? Date.now() : null,
            },
          },
        }));
      },
```

Note: NO `providers` stub and NO `sources` entry at init — like FIRMS, the
health row exists only once the user opts in (`loadSatellites` creates it).
The satellites toggle is the derived row, not a source checkbox.

- [ ] **Step 5: LayerManager derived row**

In `src/components/LayerManager.tsx` (~line 11):

```ts
type DerivedKey = 'hotspots' | 'chokepoints' | 'tradeRoutes' | 'instability' | 'sanctions' | 'satellites';
```

Append to `DERIVED_ROWS`:

```ts
  { key: 'satellites', name: '🛰 Satellites (active catalog)', meta: 'CelesTrak GP elements · SGP4-propagated · ~16k objects' },
```

- [ ] **Step 6: Typecheck + build**

Run: `npm run build`
Expected: exits 0. Vite emits a separate worker chunk containing satellite.js
(look for `sgp4.worker-*.js` in the build output listing).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/providers/celestrak.ts src/workers/sgp4.worker.ts src/state/store.ts src/components/LayerManager.tsx
git commit -m "Feat: CelesTrak TLE provider, SGP4 worker, satellites derived toggle"
```

---

### Task 4: 🛰 Satellites — map rendering, click-to-inspect, test

**Files:**
- Modify: `src/components/MapCanvas.tsx` (load handler + new effects), `src/components/InspectorRail.tsx` (`LABELS`)
- Test: `tests/smoke.spec.ts` (append)

**Interfaces:**
- Consumes: everything Task 3 produced; `alive()` guard; `select` action; source/layer patterns from the load handler.
- Produces: map source `'satellites'` + layer `'satellites-layer'`; selecting a dot yields a transient `GeoEvent` with `sourceId:'celestrak'`, `type:'satellite'`.

- [ ] **Step 1: MapCanvas — refs, subscriptions, source + layer + click**

Add near the other `useStore` subscriptions (~line 126):

```ts
  const satOn = useStore((s) => s.derivedLayers.satellites);
  const satTles = useStore((s) => s.satTles);
```

Add refs **above the map-init `useEffect` (~line 128)** so its load handler
can close over them (refs are stable objects; declaration order is the only
constraint):

```ts
  // satellite identity (from the worker's ready message) + last positions —
  // refs, not state: they change every tick and must not re-render React
  const satMetaRef = useRef<{ names: string[]; ids: string[]; periods: number[] }>({ names: [], ids: [], periods: [] });
  const satPosRef = useRef<Float64Array | null>(null);
```

In the `map.on('load', ...)` handler, directly after the events layer is
added (~line 194):

```ts
      // satellite dots: fed by the SGP4 worker, never store events. Added
      // below events-layer so event markers keep visual + click priority.
      map.addSource('satellites', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as FeatureCollection });
      map.addLayer({
        id: 'satellites-layer', type: 'circle', source: 'satellites',
        layout: { visibility: 'none' },
        paint: { 'circle-radius': 1.6, 'circle-color': '#9fe8ff', 'circle-opacity': 0.85 },
      }, 'events-layer');
```

Directly after the existing `events-layer` click/mouse handlers (~line 217):

```ts
      map.on('click', 'satellites-layer', (ev) => {
        // event markers win over a satellite dot at the same point
        if (map.queryRenderedFeatures(ev.point, { layers: ['events-layer'] }).length > 0) return;
        const idx = ev.features?.[0]?.properties?.idx as number | undefined;
        if (idx == null) return;
        const meta = satMetaRef.current;
        const pos = satPosRef.current;
        const alt = pos ? pos[idx * 3 + 2] : NaN;
        useStore.getState().select({
          id: `celestrak:${meta.ids[idx]}`,
          type: 'satellite',
          category: 'Satellite (SGP4-propagated)',
          lon: ev.lngLat.lng,
          lat: ev.lngLat.lat,
          title: meta.names[idx] ?? `NORAD ${meta.ids[idx]}`,
          time: Date.now(),
          reference: true,
          sourceId: 'celestrak',
          props: {
            noradId: meta.ids[idx],
            altitudeKm: Number.isNaN(alt) ? undefined : Math.round(alt),
            periodMin: meta.periods[idx],
            note: 'Position propagated from TLE epoch (SGP4) — a computed prediction, not an observation.',
          },
        });
      });
      map.on('mouseenter', 'satellites-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'satellites-layer', () => { map.getCanvas().style.cursor = ''; });
```

Also extend the country-click priority guard (~line 392) so satellite dots
win over the country underneath, same as event markers:

```ts
      if (map.queryRenderedFeatures(ev.point, { layers: ['events-layer', 'satellites-layer'] }).length > 0) return;
```

(`satellites-layer` is added in the load handler, before the countries effect
can register this handler, so the layer id always resolves.)

- [ ] **Step 2: MapCanvas — TLE load + worker lifecycle effects**

Add after the aviation effects from Task 2:

```ts
  // satellites: fetch TLEs once the derived toggle turns on
  useEffect(() => {
    if (satOn) void useStore.getState().loadSatellites();
  }, [satOn]);

  // satellites: worker lifecycle — spawn on (toggle && TLEs), propagate every
  // 2 s (paused while hidden), terminate on toggle-off/unmount
  useEffect(() => {
    const map = mapRef.current;
    if (!alive(map) || !ready) return;
    if (!satOn || !satTles) {
      if (map.getLayer('satellites-layer')) map.setLayoutProperty('satellites-layer', 'visibility', 'none');
      return;
    }
    map.setLayoutProperty('satellites-layer', 'visibility', 'visible');
    const worker = new Worker(new URL('../workers/sgp4.worker.ts', import.meta.url), { type: 'module' });
    let timer: number | undefined;
    worker.onmessage = (ev: MessageEvent<{ type: 'ready'; names: string[]; ids: string[]; periods: number[] } | { type: 'positions'; buf: ArrayBuffer }>) => {
      const msg = ev.data;
      if (msg.type === 'ready') {
        satMetaRef.current = { names: msg.names, ids: msg.ids, periods: msg.periods };
        worker.postMessage({ type: 'tick', now: Date.now() });
        timer = window.setInterval(() => {
          if (document.hidden) return; // no propagation for a tab nobody sees
          worker.postMessage({ type: 'tick', now: Date.now() });
        }, 2000);
        return;
      }
      const pos = new Float64Array(msg.buf);
      satPosRef.current = pos;
      const m = mapRef.current;
      if (!alive(m)) return;
      const features: Feature[] = [];
      for (let i = 0; i < pos.length / 3; i++) {
        const lonV = pos[i * 3], latV = pos[i * 3 + 1];
        if (Number.isNaN(lonV) || Number.isNaN(latV)) continue;
        features.push({ type: 'Feature', properties: { idx: i }, geometry: { type: 'Point', coordinates: [lonV, latV] } });
      }
      (m.getSource('satellites') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    };
    worker.postMessage({ type: 'init', sats: satTles });
    return () => { if (timer) clearInterval(timer); worker.terminate(); };
  }, [satOn, satTles, ready]);
```

- [ ] **Step 3: Inspector labels**

In `src/components/InspectorRail.tsx`, extend `LABELS`:

```ts
  noradId: 'NORAD ID',
  altitudeKm: 'Altitude (km)',
  periodMin: 'Orbital period (min)',
```

(`note` is already in `HANDLED` and renders through the existing note path.)

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 5: Add Playwright test**

Append to `tests/smoke.spec.ts`:

```ts
test('satellites overlay: opt-in toggle → CelesTrak chip, dots actually render', async ({ page }) => {
  test.setTimeout(240_000); // 2.7 MB TLE fetch + ~16k satrec init on slow hardware
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
  const toggle = page.getByRole('checkbox', { name: '🛰 Satellites (active catalog)' });
  // default OFF, and no CelesTrak health row before opt-in (FIRMS precedent)
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('.health-chip', { hasText: 'Satellites (CelesTrak)' })).toHaveCount(0);
  await toggle.check();
  const chip = page.locator('.health-chip', { hasText: 'Satellites (CelesTrak)' });
  await expect(chip).toContainText(/live|offline/i, { timeout: 90_000 });
  const chipText = (await chip.textContent()) ?? '';
  if (/live/i.test(chipText)) {
    // fetch succeeded → the worker round-trip must actually paint dots
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const m = (window as unknown as { __terraMap: { querySourceFeatures(id: string): unknown[] } }).__terraMap;
            return m.querySourceFeatures('satellites').length;
          }),
        { timeout: 90_000 },
      )
      .toBeGreaterThan(0);
  }
  // honest either way: offline chip with no dots is a pass (no mock, no fake)
  await toggle.uncheck(); // leave persisted state clean
});
```

- [ ] **Step 6: Run the test**

```bash
npm run build
npx playwright test -g "satellites overlay"
```
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add src/components/MapCanvas.tsx src/components/InspectorRail.tsx tests/smoke.spec.ts
git commit -m "Feat: live satellite overlay — SGP4 worker positions on the map, click-to-inspect"
```

---

### Task 5: Docs + full suite

**Files:**
- Modify: `docs/DATA_SOURCES.md`, `docs/GAP_MATRIX.md`, `docs/SESSION_NOTES.md`

**Interfaces:** none — documentation + verification only.

- [ ] **Step 1: `docs/DATA_SOURCES.md`** — add two rows/sections following the file's existing format:
  - **airplanes.live** — keyless ADS-B point API, CORS `*` verified 2026-07-10, radius ≤ 250 nm, ~1 req/s ceiling (we poll 1/20 s), non-commercial use, no mock fallback.
  - **CelesTrak** — GP element sets (active group, TLE format), CORS `*` verified 2026-07-10, 2.69 MB / 15,985 objects, fetched once per session; rendered positions are SGP4 propagations, labeled as computed.
  - Note under the old OpenSky/adsb.lol entry that transport is now unblocked via airplanes.live (the Slice 6b "no CORS-usable ADS-B" finding is superseded).

- [ ] **Step 2: `docs/GAP_MATRIX.md`** — row 17 (✈ AVIATION) and row 31 (🛰 ORBITAL SURVEILLANCE) → Done, one-line summary + date each.

- [ ] **Step 3: `docs/SESSION_NOTES.md`** — append a dated section (2026-07-10) in the established style: what shipped (three features), the probe results, worker-first note, test additions, and any gotchas actually hit during implementation (record real ones, not placeholders).

- [ ] **Step 4: Full suite sanity run**

```bash
npm run build
npm run lint
npx playwright test
```
Expected: build + lint clean; suite green, with the known caveat
(SESSION_NOTES Slice 13): full-suite runs on this shared Pi are
run-to-run flaky under load — any test that fails the full run must pass
when rerun in isolation to count as green.

- [ ] **Step 5: Commit**

```bash
git add docs/DATA_SOURCES.md docs/GAP_MATRIX.md docs/SESSION_NOTES.md
git commit -m "Docs: data sources, gap matrix, session notes for flight/satellite/globe slices"
```

---

## Verification (end-to-end)

1. `npm run dev` → open http://localhost:5173.
2. **Globe orient**: click 3D — globe eases to your longitude (SGT → 120°E). Turn 🚀 on, grant location, switch 2D→3D — globe centers on your fix.
3. **Aviation**: enable "Aircraft (live ADS-B)" at world view → health chip shows OFFLINE "view too wide". Zoom to a busy region (z≈6.5+) → dots appear within ~2 s, chip LIVE with count; click a dot → card shows callsign/type/altitude/speed with airplanes.live attribution; positions refresh every 20 s; timeline stays free of aircraft rows.
4. **Satellites**: enable 🛰 row → chip appears LOADING then LIVE ~16k; sky fills with small cyan dots drifting every 2 s; click a dot (away from event markers) → card shows name, NORAD ID, altitude, and the "propagated from TLE epoch (SGP4)" note; toggle off → dots gone, worker terminated (no further CPU).
5. Kill the network (devtools offline) and repeat 3–4 from scratch → both chips honest OFFLINE, zero fabricated data.
