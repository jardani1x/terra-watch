# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
