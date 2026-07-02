# Session Notes — Terra Watch v2 rebuild

Working branch: **`rebuild/terra-watch-v2`** (branched off `main`; `main` stays
the live v1 site). Last updated: 2026-07-02 (Slice 6 part 1).

## Progress

- **Slice 1 — DONE, committed, tested** (`a3de0a9`): React+TS+Vite shell,
  MapLibre keyless dark map, live USGS earthquakes, layer manager, provider
  health bar, inspector w/ source card, timeline drawer, Cmd/Ctrl-K palette.
- **Slice 2 — DONE, committed, tested** (`d469cf3`): NASA EONET provider
  (wildfires/volcanoes/severe storms/other), shared `src/lib/layers.ts` event→
  layer model, generalized map rendering, per-layer counts, type-aware inspector.
- **Slice 3 — DONE, committed, tested**: store (`70aae12`, previous commit) plus
  this session's UI wiring:
  - `src/components/SourceManager.tsx` — per-source enable/disable, reads/writes
    `store.sources` via `toggleSource`. `LayerManager` and `ProviderHealthBar`
    now show disabled sources as **OFF** instead of a stale freshness dot.
  - `src/components/Monitors.tsx` + `src/lib/monitors.ts` (`matchMonitor`) —
    add/remove keyword monitors with live match counts; matches get a colored
    left border in `TimelineDrawer` and a colored stroke ring on the
    `MapCanvas` marker (`circle-stroke-color`/`-width` keyed off a
    `monitorColor` feature property).
  - `CommandPalette` — added region fly-to commands (from `REGIONS`) and
    per-source enable/disable commands, alongside the existing refresh/layer
    commands.
  - `MapCanvas` — subscribes to `store.mapCmd` and calls `map.flyTo`, so both
    the palette's region commands and any future flyTo caller animate the map.
  - Tests added to `tests/smoke.spec.ts`: source toggle shows OFF + persists
    across reload, monitor add + highlight, palette region command. All 8
    Playwright tests pass; `tsc --noEmit` + `vite build` clean. See
    `docs/TEST_REPORT.md`.
- **Slice 4 — DONE, committed, tested**: link graph workspace, no new npm deps:
  - `src/lib/graph.ts` (`findRelated` — public geo-event correlation by shared
    provider/type + proximity/time, ≤800km/≤72h, source-cited edge labels) and
    `src/lib/graphLayout.ts` (grid / radial / a small deterministic force-directed
    layout, all pure functions, no physics library).
  - Store: `view` ('map'|'graph'), `graph` (`nodes`/`edges`/`layout`), actions
    `addToGraph`/`removeFromGraph`/`searchAround`/`clearGraph`/`setGraphLayout`.
    Graph persists to localStorage like Monitors — deliberate user curation, not
    a live-data cache.
  - `src/components/GraphWorkspace.tsx` — SVG render, toolbar (layout switch,
    Search around, Export JSON, Clear); StatusBar gets a MAP/GRAPH tab toggle;
    InspectorRail gets `+ Add to graph` / `✓ IN GRAPH` + Search around/Remove;
    CommandPalette gets view-switch + clear-graph commands.
  - 2 new Playwright tests (full add→search-around→layout→export→clear flow,
    palette view-switch); 10/10 pass. `tsc --noEmit` + `vite build` clean.
- **Slice 5 — DONE, committed, tested**: timeline playback + snapshots, no new
  npm deps:
  - `src/lib/snapshots.ts` — raw-IndexedDB snapshot store (`terra-watch` db,
    `snapshots` object store), 7-day retention pruned on load, `diffSnapshot`
    (added/removed event-id counts vs baseline).
  - Store: `timeWindow` (`cursor: number|null` — null = live, `playing`),
    `setTimeCursor`/`setPlaying`/`windowedEvents`; `snapshots` meta list +
    `snapshotDelta` with `loadSnapshots`/`takeSnapshot`/`removeSnapshot`/
    `compareSnapshot`. Nothing persisted to localStorage (snapshots live in
    IndexedDB; playback is transient).
  - `TimelineDrawer` — ▶/⏸ + 24h range scrubber in the head (stopPropagation so
    controls don't toggle collapse); scrubbed state shows amber
    `PLAYBACK · hh:mmZ` + `GO LIVE`, live shows green `LIVE FEED`. Map filters
    to events at-or-before the cursor too (`MapCanvas` subscribes to
    `timeWindow.cursor`).
  - `SnapshotPanel` (left rail) — save/compare(Δ)/delete; delta rendered as a
    labeled "+N new · −M no longer present" panel.
  - 2 new Playwright tests (playback label round-trip; snapshot save→Δ→delete);
    12/12 pass. Gotcha: buttons inside `.timeline-head` leak their aria-labels
    into the head's accessible name — palette/head button locators need
    `{ exact: true }`, and the graph test now selects events via the timeline
    label click instead of the head center (which is the scrubber now).

- **Slice 6 part 1 — DONE, committed, tested**: NWS provider + signal engine:
  - `src/lib/providers/nws.ts` — NOAA NWS active alerts (keyless, CORS ok,
    US-only). Only polygon-carrying alerts are mapped (centroid of first ring,
    noted in inspector props); zone-only alerts are skipped, never guessed.
    Marker size scales with alert severity.
  - `src/lib/signals.ts` + `SignalsPanel` — 1°×1° cell co-location of ≥2
    distinct public event types; panel labeled INFERENCE ("transparent count,
    not a prediction"), rows fly the map to the cell. Pure client-side, no
    store changes needed (computed via `useMemo` from `events`).
  - **GDELT news deferred to 6b**: `api.gdeltproject.org` timed out (25s, no
    response) during dev while gdeltproject.org itself was up — API service
    down/flaky. Probe it before wiring (curl the /api/v2/geo/geo endpoint).
  - Gotcha: SignalsPanel reuses `.monitor-row`, and signal rows contain words
    like "earthquake"/"events" — the Monitors and Snapshots tests had to be
    scoped to their sections via `getByLabel('Monitors'/'Snapshots')`.
  - 2 new Playwright tests; 14/14 pass. Build + typecheck clean.

## Slice 6b remaining (before Slice 7)

News (GDELT retry, RSS tiers), market panel (free-tier/BYO), transport
(OpenSky), infrastructure (open registries), FIRMS wildfire detail.

## Then Slices 7–10
graph workspace · timeline playback/snapshots · intelligence panels + signal
engine · country risk + route/scenario lite · dossier + export · optional AI
analyst · QA/mobile/a11y/deploy. See `docs/GAP_MATRIX.md`.

## Run / verify
```bash
npm install
npm run build                    # tsc --noEmit + vite build
npx playwright install chromium  # once
npx vite preview --port 4173 &
npx playwright test
```
