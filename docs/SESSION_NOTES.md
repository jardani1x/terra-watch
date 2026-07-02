# Session Notes — Terra Watch v2 rebuild

Working branch: **`rebuild/terra-watch-v2`** (branched off `main`; `main` stays
the live v1 site). Last updated: 2026-07-02 (Slice 6b part 1 — GDACS).

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

- **Slice 6b part 1 — DONE, committed, tested**: GDACS global disaster alerts:
  - Probed the deferred candidates first: **GDELT GEO API now returns 404**
    (endpoint retired, not just flaky — the DOC API is rate-limited to 1 req/5 s
    and carries no coordinates), and **OpenSky is CORS-locked to
    opensky-network.org** (adsb.lol probed as an ADS-B alternative: no CORS
    header at all). Both dropped for keyless browser use; noted in
    `docs/DATA_SOURCES.md` and the gap matrix.
  - `src/lib/providers/gdacs.ts` — GDACS event list (keyless, CORS `*`,
    live-probed: 107 features / 33 centroids). The MAP feed repeats each event
    as centroid + polygon + cyclone-track features; only `Class ===
    'Point_Centroid'` points are ingested, deduped by event id. Timestamps are
    UTC without a zone suffix (parsed as UTC). Marker size scales with the
    Green/Orange/Red alert level (`GDACS_LEVEL_SIZE` in `MapCanvas`).
  - New `disaster-alerts` layer (Advisories group, `#f06e9c`); provider/source/
    fetcher registered in the store like NWS.
  - 2 new Playwright tests (presence; source-toggle OFF round-trip); 16/16
    pass. Build + typecheck clean.

- **Slice 6b part 2 — DONE, committed, tested**: MARKETS panel:
  - News probing first: **ReliefWeb dropped as keyless default** — v2 API
    returns 403 without an approved appname (v1 is decommissioned, 410).
    News now needs a browser-usable keyless source or a BYO tier.
  - `src/lib/providers/markets.ts` — keyless, CORS-probed FX (ECB daily
    reference rates via Frankfurter, USD→EUR/JPY/GBP/CNY) + BTC/ETH spot with
    24h change (CoinGecko free tier). Non-geo → feeds the new `MarketPanel`
    (left rail), not the map. Partial-failure honest: only successful feeds'
    quotes shown with the failure noted; both down → labeled SAMPLE mock.
  - Store: `market` slice + `markets` registered in providers/sources (source
    toggle + health chip for free); fetched in `refreshAll` parallel with the
    geo providers but outside FETCHERS (no fake GeoEvents).
  - 2 new Playwright tests (attributed quotes + real mode label; source-toggle
    OFF round-trip); 18/18 pass. Build + typecheck clean.

- **Slice 7 part 1 — DONE, committed, tested**: country risk panel (v1):
  - `src/lib/risk.ts` `computeCountryRisk` — pure function over the live feed:
    groups country-attributed alerts (GDACS `props.country` + `alertLevel`),
    score = itemized sum of level weights (Red 3 / Orange 2 / Green 1),
    components listed per event, multi-country alerts credit the primary.
  - `CountryRiskPanel` (left rail) — labeled INFERENCE, "not a forecast" copy,
    rows show hazard types + alert count, hover shows the itemized components,
    click flies the map. No store changes, no persistence, no new deps.
  - 1 new Playwright test (INFERENCE label + rows-or-honest-empty); 19/19
    pass. Build + typecheck clean.

- **Slice 7 part 2 — DONE, committed, tested**: Route Explorer Lite:
  - `src/lib/chokepoints.ts` — static 9-chokepoint catalog (Suez, Panama,
    Hormuz, Malacca, Bab-el-Mandeb, Gibraltar, Bosphorus, Dover, Taiwan
    Strait) with region + commonly-used alternate route; `nearbyEvents`
    (haversine, 500 km) counts current feed events per chokepoint.
  - `RouteExplorerPanel` (left rail) — labeled ADVISORY, "not a routing
    service"; rows sorted by nearby count ("N nearby" / honest "clear feed"),
    click flies the map. Static geography + transparent count only — no
    disruption prediction. No store changes, no new deps.
  - 1 new Playwright test; 20/20 pass (one known transient console-errors
    flake from a live-provider 503, passed on isolated re-run).

- **Slice 7 part 3 — DONE, committed, tested**: Scenario Engine Lite:
  - `src/lib/scenarios.ts` — 5 static what-if walkthroughs (Suez blocked,
    Hormuz disruption, Panama drought, Malacca congestion, Bosphorus closure),
    each with premise + effects citing historical analogues (Ever Given 2021,
    Panama 2023–24 drought, Montreux 2022) and affected chokepoint ids.
  - `ScenarioPanel` (left rail) — labeled SIMULATION, expand/collapse rows;
    detail shows the static effects plus one live element: a transparent
    count of current public events within 500 km of the affected chokepoints
    (reuses `nearbyEvents`), click flies the map. **Slice 7 complete.**
  - 1 new Playwright test; 21/21 pass. Build + typecheck clean.

- **Slice 8 part 1 — DONE, committed, tested**: Dossier / report workspace:
  - `src/lib/dossier.ts` — `DossierItem` (event + citation + user note) and
    pure `dossierMarkdown`/`dossierJson` renderers. Provider attribution is
    **frozen onto the item at pin time** so exports stay cited even if the
    source is later disabled; notes are always labeled
    "Analyst note (user-authored)" — commentary never presented as source
    material. `src/lib/exports.ts` — shared `downloadText` + CSV helpers
    (CSV wired up in part 2).
  - Store: `dossier { title, items }` + `pinToDossier`/`unpinFromDossier`/
    `setDossierNote`/`setDossierTitle`/`clearDossier`; persisted to
    localStorage like monitors/graph (deliberate user curation, not a data
    cache).
  - `DossierPanel` (left rail) — editable title, per-item note input, click
    row to fly/select, EXPORT MD / EXPORT JSON / CLEAR; InspectorRail gets
    `+ Pin to dossier` / `✓ IN DOSSIER` + Unpin next to the graph actions.
  - 1 new Playwright test (pin→note→export MD+JSON→unpin round-trip);
    22/22 pass. Build + typecheck clean.

## Slice 6b remaining (blocked/optional)

News (blocked keyless: GDELT dead, ReliefWeb needs appname, RSS lacks CORS),
transport (blocked: no CORS-usable keyless ADS-B source found yet),
infrastructure (open registries), FIRMS wildfire detail (BYO key).

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
