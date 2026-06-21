# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- ============================================================ -->
<!-- ✅ BUILD COMPLETE — READ FIRST -->
<!-- ============================================================ -->

## ✅ BUILD COMPLETE (NAV RAIL + tools build-out)

**REMINDER TO CLAUDE:** This multi-step build is finished — all four steps are
done and committed. There is no gated "next step"; treat any new request as a
fresh task.

Multi-step task: extend terra-watch with (A) a centralized icon NAV RAIL of
swappable workspaces, then (B) a measure tool, (C) faceted asset search, and
(D) satellite/flight/vessel tracking. Civilian situational-awareness only —
**no targeting / fire-control / tasking / strike planning**, ever. Static, no
build step, no backend, no npm; libs via the import map; never commit secrets
(runtime + localStorage only); real→mock fallback with honest STALE/MOCK badges;
new logic in new `js/` modules with `init*()`; keep `--accent`/`ACCENT` in sync.

Progress:

- [x] **STEP 0** — Read & report current layout regions. Done.
- [x] **STEP 1** — NAV RAIL refactor. Done & committed (`71f96b9`). The two
  fixed sidebars are replaced by `js/ui/navrail.js` + one swappable `#workspace`
  with `<section data-ws>` panels: **Layers** (toggles + privacy), **Feeds**
  (market feed), **Graph** + **Timeline** (reserved placeholders). Inspector
  stays a selection-driven dock (not a tab). Mobile: rail folds into the bottom
  tray. (Also committed separately: `3a9cf2a`, first-fix street zoom z14→z17.)
- [x] **STEP 2 — MEASURE tool.** Done. New `js/ui/measure.js` (`initMeasure()`)
  + a "Measure" workspace (⟟) with START/CLEAR + a per-leg/total readout. In
  measure mode a globe click drops a vertex (pointerup picker swallows it — no
  country-news/marker) and draws a geodesic `THREE.Line` + vertex dots under
  `earth`; per-leg + total distance via `haversineKm` and initial bearing via new
  `initialBearing` (`js/util/distance.js`); CLEAR resets. The same path is
  mirrored as a dashed `L.polyline` on the Leaflet street view, built from new
  pure `greatCirclePoints` (`js/util/geo.js`). Orbit/drag untouched when off
  (drag-vs-click threshold). Verified statically (`node --check` + id contract).
- [x] **STEP 3 — Faceted ASSET SEARCH.** Done. New
  `js/data/providers/overpassProvider.js` (OSM Overpass, keyless, 8 civilian
  facets, bbox QL, `verifyOverpass()` CORS probe cached, deterministic mock
  fallback) + new `js/ui/search.js` (`initSearch()`: name box + facet chips with
  live counts, client-side filter, pushes the visible set back via `onResults`)
  + a "Search" workspace (⌕). `currentViewBBox()` uses the street-map bounds when
  zoomed in else a box around the fix/sub-camera point. Results upsert as
  `ENTITY.ASSET` (`viewType:'asset'` → new `assetView`), markers via
  `addMarkers('search', …)` in a dedicated group, selection via the bus. Verified
  statically (`node --check` + id contract).
- [x] **STEP 4 — TRACKING (sat/flight/vessel).** Done & committed (`60a63de`).
  Added `satellite.js` to the import map (`esm.sh/satellite.js@5`, resolve +
  SGP4-export probe verified first). Three providers wired:
  `satelliteProvider` (CelesTrak `visual` TLE → SGP4 via dynamic `import('satellite.js')`,
  capped sample, deterministic mock orbits on failure), `flightProvider` (OpenSky
  `/states/all` anon bbox + optional runtime OAuth2 creds; HTTP-429/error → mock
  ADS-B), `vesselProvider` (mock by design — no keyless CORS AIS REST feed; honest
  even with a key). All three are LAYERS toggles (`satellites`/`flights`/`vessels`,
  default-off) so they get marker groups + command-palette entries for free, plus a
  new **Tracking** workspace (✦) via `js/ui/tracking.js` (`initTracking()`): per-feed
  enable rows with live count + MOCK/STALE badges, in-view refresh, and a local-only
  OpenSky/AIS credential form (`creds` in localStorage, never committed). Satellites
  re-propagate on a 5 s timer (TLEs fetched once); aircraft poll 30 s, vessels 45 s;
  all timers stop on layer-off. New entities upsert as `ENTITY.ASSET` with
  `viewType:'satellite'|'flight'|'vessel'` → new `satelliteView`/`flightView`/
  `vesselView`; `addMarkers` gained an optional per-item radius `r` so sats float at
  altitude. Verified statically (`node --check`, import-map JSON, full id contract).

After every step: working, committed, deployable to GitHub Pages as-is; tell the
user what to click to verify; never break the globe/GPS, the no-build deploy, or
`.nojekyll`. Verification note: this sandbox has no browser, so steps are
verified statically (`node --check`, id/contract checks) — visual QA is the user's.

## What this is

**TERRA-WATCH** — a single-page, static 3D Earth command-center website with a
US-military HUD aesthetic. It renders an interactive Three.js globe, plots the
user's live GPS location, and shows position telemetry + a heading compass.

There is **no build step, no backend, no package manager, and no dependencies
installed locally** — all libraries (Three.js, OrbitControls, topojson-client)
are loaded from CDNs at runtime via an import map and ESM URLs. The repo is the
deployable artifact; it is designed to be dropped onto GitHub Pages as-is
(`.nojekyll` forces verbatim asset serving).

## Running

Geolocation and ES-module imports require an `http(s)://` origin — opening
`index.html` via `file://` will not work. Serve the folder:

```bash
python3 -m http.server 8080   # then open http://localhost:8080
# or: npx serve .
```

There are no tests, no linter, and no build/CI commands.

## Architecture

Three top-level files plus a small ES-module tree under `js/`:

- **`index.html`** — the entire DOM skeleton. Every dynamic value lives in an
  element with a stable `id` (e.g. `lat`, `lon`, `dtg`, `hdg-deg`, `sb-fps`).
  `app.js` finds these by id and writes into them; the HTML is otherwise static.
  The Three.js import map is declared here.
- **`styles.css`** — all styling, driven by CSS custom properties in `:root`
  (`--accent`, `--bg`, `--panel`, fonts). The HUD "glass panel" look is the
  shared `.hud` class.
- **`app.js`** — the entry module (no exports) that runs on load. It owns the
  Three.js scene, the globe, the location/compass/HUD logic, and the render
  loop, and orchestrates everything else by importing the `js/` modules below.
- **`js/`** — extracted, mostly-pure modules that `app.js` composes:
  - `js/util/` — leaf helpers with no scene state: `geo.js` (lat/lon ↔ sphere
    projection and point-in-polygon picking), `distance.js` (haversine),
    `format.js` (price/percent/time formatting), `storage.js` (localStorage
    persistence wrapper).
  - `js/data/` — `feeds.js` plus `providers/` (market, earthquake, weather,
    mock) behind a shared `http.js`; the live data layer with graceful
    `markStale` fallback when a fetch fails.
  - `js/ontology/model.js` — the entity/relation graph + market-center metadata
    (`MARKET_CENTERS`, `isMarketOpen`).
  - `js/ui/` — the panel widgets: `shell.js`, `layers.js`, `commandPalette.js`,
    `inspector.js`, `marketFeed.js`, each exposing an `init*` entry point, plus
    `news.js` (the country-headlines lightbox: `openNews` / `initNews`).

The refactoring direction is to keep pulling pure, self-contained logic out of
`app.js` into `js/`; what remains in `app.js` is the code that shares mutable
Three.js scene state (scene, camera, the `earth` group, materials, marker).

`app.js` is organized into commented banner sections that map to the UI:

- **Coordinate helpers** — the pure lat/lon math lives in `js/util/geo.js`
  (imported by `app.js`): `lonLatToVec3` (the projection from lat/lon to a point
  on the sphere; shared by the marker, graticule, and borders) and its inverse
  `vec3ToLonLat`, `toDMS`, `gridZone` (UTM/MGRS designator), `cardinal`, plus the
  point-in-polygon picker helpers `polysOf` / `pointInRing` / `polyContains`.
- **Three.js scene** — renderer/camera/`OrbitControls`, the `earth` group (ocean
  sphere, graticule, async-loaded country borders), atmosphere fresnel shader,
  starfield. `loadBorders()` fetches the `world-atlas` topojson and degrades
  gracefully to grid-only if the CDN fetch fails.
- **Location marker / camera focus** — `placeMarker()` builds the pulsing beacon;
  `focusOn()` sets a target the render loop lerps the camera toward.
- **HUD state + updates** — `onPosition(lon, lat, alt, extra, sim)` is the single
  sink that updates *every* telemetry readout. Both real GPS and the simulated
  fallback funnel through it; the `sim` flag drives all "SIMULATED/SIM FIX" UI.
- **Geolocation** — `startGeo()` uses `navigator.geolocation.watchPosition`.
  On denial or missing API it falls back to `CFG.fallback` with `sim: true`.
- **Compass** — SVG rose built in JS; `onOrient` reads `DeviceOrientation`
  (handling the iOS `requestPermission` gate and `webkitCompassHeading`), with an
  N-up static fallback where device orientation is unavailable.
- **Boot sequence** — `boot()` runs a fake uplink animation, then loads borders,
  inits the compass, and starts geolocation.
- **Render loop** — single `requestAnimationFrame` loop handling camera lerp,
  ring pulse animation, `controls.update()`, render, and FPS/range readouts.

Key conventions:

- All config lives in the `CFG` object and the `ACCENT` color near the top of
  `app.js`. The accent color is duplicated in two places — keep `--accent` in
  `styles.css` and `ACCENT` in `app.js` in sync.
- DOM access is always through the `$ = (id) => document.getElementById(id)`
  helper. New dynamic values mean adding an element with an id to `index.html`
  and writing it in the matching section of `app.js`.
- The military classification banner and styling are **cosmetic only** — no
  classified data, no government affiliation.
