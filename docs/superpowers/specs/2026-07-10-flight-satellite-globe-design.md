# Design: Flight tracker, satellite tracker, globe auto-orient

Date: 2026-07-10. Status: approved by user.
Covers Tranche B rows 17 (✈ AVIATION) and 31 (🛰 ORBITAL SURVEILLANCE) from
`2026-07-09-phase2-layer-triage.md`, plus a new 3D-globe orient behavior.

## Goals

1. **✈ Aviation layer** — live aircraft in the current map view, keyless.
2. **🛰 Satellites overlay** — all active catalog objects (~16k), live
   SGP4-propagated positions, keyless.
3. **🌐 Globe orient** — entering 3D orients the globe to the user's
   longitude (GPS fix if the 🚀 locate watch is on, else browser timezone).

## Probes (verified live 2026-07-10)

- `https://api.airplanes.live/v2/point/{lat}/{lon}/{radius}` —
  `Access-Control-Allow-Origin: *`, 200, live JSON (`ac` array; fields incl.
  `flight`, `r`, `t`, `desc`, `alt_baro`, `gs`, `track`, `squawk`).
  Radius ≤ 250 nm. Rate guidance: ~1 req/s max; we poll far below that.
- `https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle` —
  `Access-Control-Allow-Origin: *`, 200, 2.69 MB, **15,985 objects**.
- `satellite.js` 7.0.1, MIT, 657 KB unpacked — must live in a lazy chunk.

## Feature 1 — ✈ Aviation layer

**Pattern**: clone of the military-bases in-view feed (`store.refreshMilitary`
`src/state/store.ts:441` + MapCanvas 1200 ms debounce `MapCanvas.tsx:234`).

- `src/lib/providers/aviation.ts` — `AVIATION_META` (id `airplanes-live`,
  name "airplanes.live", homepage/license noted) +
  `fetchAircraft(bbox, signal?)`: converts `viewBounds` to center + radius
  (haversine to the farthest corner, capped 250 nm), calls `/v2/point/...`,
  maps each aircraft to a `GeoEvent`:
  - `id`: ICAO hex; `type: 'aircraft'`; `title`: callsign (trimmed) or
    registration or hex; `time`: fetch time; `lat`/`lon` from feed.
  - `props`: `callsign`, `registration`, `aircraftType` (`t`), `desc`,
    `altitudeFt` (`alt_baro`; the feed sends the string `"ground"` for taxiing
    aircraft — keep it verbatim), `speedKt` (`gs`), `track`, `squawk`.
  - **`reference: true`** — aircraft are position snapshots, not events;
    excluded from timeline/playback/snapshots/signals (`types.ts:23`).
- **Guards** (same as military): source+layer enabled, viewBounds present,
  view too wide (> 60° e-w or > 40° n-s) → provider `offline` with
  "view too wide — zoom in to load aircraft", single in-flight fetch.
- **NO mock fallback** — fetch failure returns `{events: [], mode:'offline',
  error}` (overpass.ts:6 policy). Never fabricate aircraft.
- **Refresh**: MapCanvas effect — 1200 ms debounce on `[aviationOn,
  viewBounds]`, plus a 20 s interval re-poll while the layer is enabled and
  the view is in-bounds (planes move ~7 km/min; 20 s keeps positions honest
  and stays ~1/20th of the API's stated rate ceiling). Interval cleared on
  toggle-off/unmount.
- **Layer**: new `LayerDef` `{id:'aviation', group:'✈ Transport',
  enabled:false, providerId:'airplanes-live', eventTypes:['aircraft'],
  color:'#7ec8ff'}` (sky blue, unused by existing layers) — default OFF
  (opt-in live feed, like military bases).
  Registered in `FETCHERS`? **No** — like `osm-military`, it is in-view
  driven, not part of `refreshAll`.
- **Store**: `refreshAviation()` mirroring `refreshMilitary()` (merge =
  replace-by-source); provider stub + source toggle + health chip for free.
- **Inspector**: add `LABELS` entries (`callsign` → "Callsign", `altitudeFt` →
  "Altitude (ft)", `speedKt` → "Ground speed (kt)", etc.). Renders via the
  existing generic card; source card shows airplanes.live attribution.
- **Render**: existing `events-layer` circle machinery, standard size.

## Feature 2 — 🛰 Satellites overlay

**NOT GeoEvents.** 16k moving points rebuilt into `store.events` every tick
would poison timeline/snapshots/signals and rebuild `toFeatureCollection`
constantly. Separate pipeline, rendered directly:

- `src/lib/providers/celestrak.ts` — `CELESTRAK_META` + `fetchTles(signal?)`:
  GETs the active-group TLE text (2.7 MB), parses to
  `{name, l1, l2}[]`, returns `{sats, mode:'live', latencyMs, error}`.
  Fetched **once per toggle-on session** (TLEs are valid for days); no
  periodic re-fetch. Failure → honest `offline` chip, overlay absent.
- `src/workers/sgp4.worker.ts` — **repo's first Web Worker** (Vite-native
  `new Worker(new URL(...), {type:'module'})`, no config change):
  - `init` message: TLE list → builds satrecs (satellite.js
    `twoline2satrec`), replies with count + name/NORAD-id index.
  - `tick` message: propagates all satrecs at `Date.now()`
    (`propagate` → `eciToGeodetic`), replies with a **transferable
    Float64Array** `[lon, lat, altKm] × N` (NaN row for decayed/failed
    satrecs; main thread skips NaN rows when building features).
  - satellite.js imported only inside the worker → its own lazy chunk;
    main bundle unaffected.
- **MapCanvas**: dedicated GeoJSON source `satellites` + small circle layer
  (~1.5 px dots, distinct color) added below `events-layer` (event markers
  keep click priority via the existing `queryRenderedFeatures` guard,
  `MapCanvas.tsx:390`). Effect keyed on the toggle: spawn worker → send TLEs →
  `setInterval` tick every 2 s → `getSource('satellites').setData(fc)`.
  Paused on `document.visibilitychange` (hidden) and torn down on toggle-off/
  unmount. All map touches behind the `alive(map)` guard.
- **Selection**: click on a satellite dot builds a transient GeoEvent-shaped
  object (`sourceId:'celestrak'`, `type:'satellite'`, `reference:true`,
  props: `noradId`, `altitudeKm`, `periodMin` — derived from mean motion —
  plus TLE epoch) and calls `setSelected`. InspectorRail renders it with the
  standard card; copy notes **"position propagated from TLE epoch (SGP4)"** —
  computed prediction, not an observation. Never presented as live telemetry.
- **Toggle + health**: persisted boolean — a new `satellites` key inside the
  existing `derivedLayers` record (reuses `toggleDerived` + persistence +
  forward-compat spread merge as-is), LayerManager row
  under a `🛰 Orbital` group; health chip "CelesTrak" with
  `itemCount` = object count, mode `live` (reflects the TLE fetch, the one
  network fact).
- **Perf budget**: 16k satrec inits once (~1 s, worker); 16k propagations
  per 2 s tick ≈ 100–300 ms desktop, worker thread only; 16k-point GeoJSON
  circle layer is well within MapLibre limits. If the Pi dev box struggles,
  the tick interval is the tuning knob (raise to 5 s), not a scope cut.

## Feature 3 — 🌐 Globe orient

- Helper (new `src/lib/orient.ts` or inline in MapCanvas):
  `homePosition(geoPos)`:
  - GPS watching + fix → `{lon: pos.lon, lat: pos.lat}`.
  - Else timezone estimate → `{lon: -(new Date().getTimezoneOffset() / 60) *
    15, lat: 20}` (offset is minutes west-of-UTC, so negate; 20°N default
    latitude keeps most populated landmass in view).
- Hook site: existing `[projection]` effect (`MapCanvas.tsx:514`). On
  transition **into** `'3d'` (and once after load when the persisted setting
  is already `'3d'`): `easeTo({center, duration: 1200})`;
  `prefersReducedMotion()` (`a11y.ts:23`) → `jumpTo`. Zoom untouched.
  One-shot per 2D→3D switch; user keeps full manual control afterwards.
- No persistence, no network, no new state — reads transient `geo.pos`
  (`store.ts:92`) at switch time.

## Error handling summary

| Failure | Behavior |
|---|---|
| airplanes.live down / CORS change | OFFLINE chip + error text, empty layer, no mock |
| View too wide (aviation) | OFFLINE chip "zoom in to load aircraft" |
| CelesTrak down | OFFLINE chip, overlay absent, toggle stays honest |
| Satrec propagation failure (decayed) | NaN row skipped by main thread; object silently absent |
| Worker unsupported/crash | Toggle-on shows OFFLINE chip with error, no overlay |
| No GPS fix + odd timezone | Falls back to timezone lon; worst case orients to UTC meridian |

## Testing (Playwright, existing conventions)

1. **Aviation**: layer default-off; enable at world view → chip OFFLINE with
   bbox-guard text (mirror of military test `smoke.spec.ts:1040`); source
   toggle round-trip. Live-fetch assertion best-effort (real network).
2. **Satellites**: toggle on → "CelesTrak" health chip appears; satellite
   map layer visible via `window.__terraMap.getLayoutProperty`;
   `expect.poll` source features > 0 (worker round-trip). 90 s slow-hardware
   timeout (established convention).
3. **Globe orient**: test fixes `timezoneId` in Playwright context; switch to
   3D → `expect.poll(map.getCenter().lng)` ≈ expected timezone longitude.
4. Docs: DATA_SOURCES.md (2 new sources + probe notes), GAP_MATRIX rows
   17 + 31 → Done, SESSION_NOTES entry.

## Build order (3 slices, each build + typecheck + test + commit)

1. **Slice O** — globe orient (smallest, no new deps).
2. **Slice A** — aviation layer.
3. **Slice S** — satellites (new dep + worker, biggest).

## Out of scope

Heading-rotated aircraft icons (symbol layer), orbit ground-track lines,
satellite search/filter by name, military-only feed (`/v2/mil`), pass
predictions. All possible follow-ups; none needed for the approved goals.
