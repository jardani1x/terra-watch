# Test Report

Environment: Node 24.15, npm 11.12, Playwright (Chromium headless), Raspberry Pi
(aarch64). Run date: 2026-07-03.

## Build, typecheck & lint

| Check | Command | Result |
|---|---|---|
| Typecheck (strict) | `tsc --noEmit` | ✅ pass (0 errors) |
| Lint | `npm run lint` (ESLint flat config: js + typescript-eslint + react-hooks + react-refresh) | ✅ pass (0 errors, 0 warnings) |
| Production build | `vite build` | ✅ pass — `dist/` emitted |

Build output: `index.html` 0.93 kB; app shell 216.6 kB JS (70.4 kB gz) +
9.95 kB CSS; MapLibre code-split into its own lazy chunk — 806.1 kB JS
(219.3 kB gz) + 65.5 kB CSS — loaded async so the shell paints first. The
former single-bundle chunk-size warning is resolved (Slice 10).

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
| **timeline playback shows PLAYBACK label and returns to live** | ▶ switches the amber `PLAYBACK · hh:mmZ` label on; `GO LIVE` restores the green `LIVE FEED` label | ✅ pass |
| **snapshots: save, compare shows labeled delta, delete** | `⊕ SAVE SNAPSHOT` adds a row; `Δ` shows the "+N new · −M no longer present" baseline comparison; `✕` deletes and restores the empty-state copy | ✅ pass |
| **NWS weather alerts source and layer are present** | Weather-alerts layer checkbox, NWS source toggle, and NOAA NWS health chip all render | ✅ pass |
| **signals panel is labeled INFERENCE and renders honestly** | SIGNALS section carries the amber INFERENCE tag + "not a prediction" copy; shows either real co-location rows (click flies the map) or the honest empty state | ✅ pass |
| **GDACS disaster alerts source and layer are present** | Disaster-alerts layer checkbox, GDACS source toggle, and GDACS health chip all render | ✅ pass |
| **GDACS source toggle shows OFF in health bar and layer manager** | unchecking the GDACS source shows `OFF` in its health chip and `OFF · source disabled` in the layer row; re-checking clears both | ✅ pass |
| **market panel shows attributed quotes with a real mode label** | MARKETS panel renders a LIVE or honest SAMPLE tag (derived from the fetch), a USD/EUR row, and the Frankfurter + CoinGecko attribution line | ✅ pass |
| **markets source toggle disables the panel honestly** | unchecking the Markets source shows "Source disabled" in the panel and `OFF` in the health chip; re-checking restores live quotes | ✅ pass |
| **country risk panel is labeled INFERENCE and renders honestly** | COUNTRY RISK section carries the INFERENCE tag + "not a forecast" copy; shows either itemized country rows (click flies the map) or the honest empty state | ✅ pass |
| **route explorer lists chokepoints with ADVISORY label and honest counts** | ROUTE EXPLORER carries the ADVISORY tag + "Not a routing service" copy; all 9 static chokepoints render with transparent "N nearby"/"clear feed" counts; clicking Suez flies the map | ✅ pass |

| **scenario engine is labeled SIMULATION and expands a what-if honestly** | SCENARIOS carries the SIMULATION tag + "not a prediction" copy; expanding "Suez Canal blocked" shows static effects (Cape of Good Hope reroute) and a transparent live-context count; collapse works | ✅ pass |
| **dossier: pin from inspector, add note, export MD, unpin** | honest empty state; `+ Pin to dossier` → `✓ IN DOSSIER` + panel row with frozen citation + "pinned just now"; note input labeled user-authored; `EXPORT MD`/`EXPORT JSON` trigger `terra-watch-dossier-*.md/.json` downloads; unpin restores empty state in panel and inspector | ✅ pass |
| **timeline exports current events as CSV and JSON** | head export buttons enabled once events load; downloads named `terra-watch-events-*.csv/.json` (locators need `exact: true` — head accessible-name gotcha) | ✅ pass |
| **market panel exports quotes as CSV** | `⤓ CSV` next to the attribution line downloads `terra-watch-markets-*.csv` | ✅ pass |
| **AI analyst: generate brief works with zero config** | AI ANALYST carries the `LOCAL RULES` tag with no key set; `GENERATE BRIEF` produces one assistant message tagged `LOCAL RULES` — deterministic, no network call | ✅ pass |
| **AI analyst: disallowed question is refused locally** | asking a pattern-of-life-style question is refused with the civilian-use policy message, without needing a key or hitting the network | ✅ pass |
| **privacy: clear local data wipes settings after two-step confirm** | adding a monitor, then `CLEAR LOCAL DATA` → `CONFIRM CLEAR?` reloads the page and the monitor is gone | ✅ pass |
| **mobile: rails open as bottom sheets from the status-bar toggles** | at 390×844 the ☰/◨ toggles open the panels/inspector rails as bottom sheets (`.rail.open`); close buttons dismiss them | ✅ pass |
| **keyboard: timeline drawer and panel rows are keyboard-operable** | focused timeline head toggles with Enter/Space (`aria-expanded` round-trip); a chokepoint row activates with Enter and the map stays healthy | ✅ pass |
| **reduced motion: region navigation jumps without animation** | with `prefers-reduced-motion: reduce` emulated, a palette region command uses the instant `jumpTo` path and the map stays healthy | ✅ pass |

**30 passed / 0 failed**. Screenshots written to `docs/screenshots/`.

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
- **Timeline playback**: scrubber + play/pause over the rolling 24h window. Scrubbed
  views filter both the timeline and the map to events at-or-before the cursor and are
  labeled **PLAYBACK · hh:mmZ** (amber) — never presented as live. `GO LIVE` returns to
  the live feed.
- **Snapshots**: local IndexedDB baselines (7-day retention, pruned on load; never sent
  anywhere). Comparing shows a transparent added/removed event-id count vs the baseline,
  labeled as a delta over public data.
- **NWS weather alerts**: third live provider; only polygon-carrying alerts are mapped
  (centroid, noted in inspector props) — zone-only alerts are skipped, never guessed.
- **GDACS disaster alerts**: fourth live provider (keyless, CORS `*`, live-probed before
  the adapter was written). Global multi-hazard alerts; only each event's
  `Point_Centroid` feature is ingested (polygon/track duplicates skipped), markers
  size-scale with the Green/Orange/Red alert level, centroid placement noted in
  inspector props.
- **Signals (inference)**: 1°×1° cell co-location of ≥2 public event types, computed
  client-side over the current feed. Panel is labeled INFERENCE with "not a prediction"
  copy; every signal cites its contributing count and flies the map to the cell.
- **AI analyst**: always-on local-rules brief (zero key, zero network) that
  matches the numbers shown elsewhere in the UI (country risk, chokepoint
  proximity, monitor hits); optional Anthropic/OpenAI-compatible key calls
  the provider directly from the browser and is labeled `AI · INFERENCE`;
  a local keyword check refuses excluded-category questions before any
  network call; LLM failures fall back to the local brief with the real
  error shown, never hidden.
- **Privacy**: "Clear local data" (two-step in-UI confirm) wipes the
  persisted settings blob and the IndexedDB snapshot store, then reloads.
- **Mobile (Slice 10)**: at ≤860px both rails are bottom sheets with a grab
  handle, close button, Escape, and overlay-tap dismissal, opened from
  status-bar toggles; selecting a map object auto-opens the inspector sheet.
- **Accessibility (Slice 10)**: every clickable row is a focusable
  Enter/Space-operable button (`src/lib/a11y.ts` `pressable`), global
  `:focus-visible` outlines, palette combobox/listbox semantics,
  `prefers-reduced-motion` disables CSS animation and switches the map to
  `jumpTo`. Contrast spot-checked at AA (muted-on-dark ≈ 5.3:1).
- No "reserved"/placeholder panels present.

## Coverage gaps (planned)
All 10 slices are covered. Live BYO-key LLM calls (AI analyst) are exercised
manually, not in CI — kept out of the suite deliberately so it stays
deterministic and key-free.

## How to reproduce
```bash
npm install
npm run build                 # typecheck + build
npx playwright install chromium
npx vite preview --port 4173 & # serve dist
npx playwright test           # run smoke suite
```
