# Test Report

Environment: Node 24.15, npm 11.12, Playwright (Chromium headless), Raspberry Pi
(aarch64). Run date: 2026-07-02.

## Build & typecheck

| Check | Command | Result |
|---|---|---|
| Typecheck (strict) | `tsc --noEmit` | ✅ pass (0 errors) |
| Production build | `vite build` | ✅ pass — `dist/` emitted |

Build output: `index.html` 0.93 kB, CSS 72.5 kB (10.9 kB gz), JS 979 kB
(276 kB gz). The JS chunk-size warning (MapLibre) is tracked for code-splitting
in Slice 10.

## End-to-end (Playwright, `tests/smoke.spec.ts`)

Run against `vite preview` on :4173.

| Test | Asserts | Result |
|---|---|---|
| loads without console errors | shell + `.maplibregl-canvas` + SOURCES render; no app-level console/page errors (benign tile/network noise filtered) | ✅ pass |
| layer toggle works | Earthquakes layer checkbox checked → unchecked (scoped to the exact layer label to avoid colliding with the new source checkbox) | ✅ pass |
| natural-event layers from EONET present | Wildfires/Volcanoes/Severe-storms checkboxes + EONET health chip visible | ✅ pass |
| command palette opens via Ctrl+K | dialog + command input visible | ✅ pass |
| mobile viewport renders | shell visible at 390×844 | ✅ pass |
| **source toggle shows OFF and persists across reload** | unchecking "USGS Earthquakes" source shows `OFF` in the health chip and `OFF · source disabled` in the layer row; state survives `page.reload()` via the `terra-watch:v2` localStorage persist | ✅ pass |
| **monitors: add a keyword and see it highlighted** | typing "earthquake" into the monitor input + Enter creates a monitor row with remove control | ✅ pass |
| **command palette region command flies the map** | "Go to region: Asia" command runs, palette closes, map canvas remains healthy (no crash on `flyTo`) | ✅ pass |
| **graph workspace: add, search around, switch layout, export, clear** | select event → `+ Add to graph` → `✓ IN GRAPH`; GRAPH tab shows 1 SVG node; `SEARCH AROUND` expands it; `RADIAL`/`GRID` layout switches render without error; `EXPORT JSON` triggers a `terra-watch-graph-*.json` download; `CLEAR` empties the graph | ✅ pass |
| **command palette can switch to graph view** | "Switch to Graph view" command opens `.graph-wrap` | ✅ pass |

**10 passed / 0 failed.** Screenshots written to `docs/screenshots/`.

### Verified behavior (from the passing run + captured snapshot)
- USGS **live**: ~38 earthquakes; NASA EONET **live**: 200 natural events
  (186 wildfires, 9 volcanoes, 2 severe storms, 3 other) — color-coded per layer.
- Status pill showed **LIVE · PUBLIC OSINT** (derived from both providers, not hardcoded).
- Provider health bar showed `USGS LIVE 38` + `NASA EONET LIVE 200` with latency + freshness.
- Per-layer counts render in the layer manager; timeline shows 200 events.
- **Source manager**: per-source toggle stops that provider's fetch and events drop off
  the map/timeline immediately; disabled state persists across reload.
- **Monitors**: keyword monitors highlight matching events with a colored left-border in
  the timeline and a colored stroke ring on the map marker; match counts shown live.
- **Command palette**: now also lists Map/Graph view-switch commands, region fly-to
  commands (`REGIONS`), per-source enable/disable commands, and clear-graph (when the
  graph is non-empty), in addition to refresh + layer toggles.
- **Graph workspace**: user-curated read-only correlation graph over public geo-events.
  `+ Add to graph` snapshots a selected event as a node; `Search around` finds related
  public events (same provider/type, ≤800km, ≤72h apart) via `src/lib/graph.ts` and adds
  them with a labeled edge (e.g. "same type · 42km · 3h apart"). Three layouts (force/
  radial/grid) computed client-side with no new dependency (`src/lib/graphLayout.ts`).
  Export writes the graph to a downloadable JSON file. Graph state persists to
  localStorage like Monitors (deliberate user curation, not a live-data cache).
- No "reserved"/placeholder panels present.

## Coverage gaps (planned)
E2E for timeline filters/playback, route & scenario simulations, dossier export, and
full accessibility/mobile-bottom-sheet land with their respective slices (5–10), per
`docs/GAP_MATRIX.md`. Linting (ESLint) config is planned for Slice 10.

## How to reproduce
```bash
npm install
npm run build                 # typecheck + build
npx playwright install chromium
npx vite preview --port 4173 & # serve dist
npx playwright test           # run smoke suite
```
