# Gap Matrix

Status of each mandated capability. Updated after Slice 6b part 1 (GDACS). Honest labels:
**Done** (built + tested), **Partial** (basic version shipped, more planned),
**Deferred** (planned, not yet started).

Legend for "vs" columns: does the capability have a public analogue in Gotham (G)
/ World Monitor (WM)?

| Capability | Status | Slice | G | WM | Notes |
|---|---|---|---|---|---|
| App shell (status bar, rails, drawer) | **Done** | 1 | ✓ | ✓ | CSS-grid shell, responsive |
| Interactive map (MapLibre) | **Done** | 1 | ✓ | ✓ | Dark keyless basemap; earthquakes plotted |
| Layer manager (grouped, freshness) | **Done** | 1 | ✓ | ✓ | Toggle + item count + last-updated |
| Provider health / freshness bar | **Done** | 1 | ✓(audit) | ✓ | status·items·latency·freshness per source |
| Data mode never faked | **Done** | 1 | — | ✓ | LIVE/DEMO/DEGRADED derived from fetch |
| Object inspector + source card | **Done** | 1 | ✓ | ✓ | detail + license + authoritative link |
| Command palette (Cmd/Ctrl-K) | **Done** | 1→3 | ✓ | ✓ | refresh + layer toggles + region fly-to (`REGIONS`) + per-source enable/disable |
| Timeline (rolling feed) | **Done** | 1→16 | ✓ | ✓ | Live feed + click-inspect + monitor highlight + 24h scrub/playback (labeled PLAYBACK, filters map too); events contributing to a SIGNALS co-location cell carry an in-feed `◆ SIGNAL` marker (INFERENCE-labeled, same computation and time window as the panel) |
| Normalized ontology | **Partial** | 1→3 | ✓ | ✓ | GeoEvent (typed, categorized) + Provider across 2 providers; entities/relations in later slices |
| Civilian-use disclaimers | **Done** | 1 | — | — | Inspector + privacy language, no militarized copy |
| Search "this view" | **Done** | 1→15 | ✓ | ✓ | palette searches loaded events on visible layers inside the current map viewport (labeled `event · in view`); result click flies to + selects the event |
| Source manager (per-source toggle) | **Done** | 3 | ✓ | ✓ | fetch-time filtering, OFF shown in health bar + layer rows, persisted to localStorage |
| Custom keyword monitors | **Done** | 3 | — | ✓ | local-persisted; highlights matches in timeline (left border) and on the map (stroke ring) with live match counts |
| Link graph workspace | **Partial** | 4 | ✓ | ✓ | add-to-graph, search-around (proximity+time, source-cited), 3 layouts, JSON export; only geo-events so far, no news/market entities (Slice 6) |
| Snapshots / playback | **Done** | 5 | ✓ | ✓ | IndexedDB baselines, 7-day retention, labeled added/removed delta vs baseline; 24h timeline playback |
| News intelligence panel | **Deferred** | 6b+ | — | ✓ | GDELT dropped (GEO API 404/retired); ReliefWeb dropped as keyless default (needs approved appname); most RSS lacks CORS — needs a browser-usable keyless source or BYO tier |
| Market panel | **Done** | 6b→13 | — | ✓ | keyless FX (ECB via Frankfurter) + BTC/ETH (CoinGecko) in a rail panel; LIVE/SAMPLE label derived from real fetch, per-quote attribution, source toggle; FOMC meeting calendar (vendored, static, CACHE-labeled) surfaces the next upcoming meetings |
| Natural events panel | **Done** | 1,2,6,6b,17 | — | ✓ | quakes (USGS) + wildfires/volcanoes/storms (EONET) + US weather alerts (NWS) + global GDACS disaster alerts (Green/Orange/Red, size-scaled) live; FIRMS last-24h VIIRS detections as an optional BYO-MAP_KEY WMS raster overlay (rendered by NASA, labeled overlay — never itemized events) |
| Infrastructure panel | **Done** | 6→12 | ✓ | ✓ | vendored open registries as normal layers: nuclear power plants (WRI Global Power Plant DB) + space launch sites (GCAT), per-source toggle, honestly labeled CACHE (static, not live) |
| Transport panel — ✈ Aviation (row 17) | **Done** | 6b+→P2B, 2026-07-10 | ✓ | ✓ | live ADS-B via airplanes.live (keyless, point+radius ≤250nm); opt-in layer default off, 12°×8° in-view bbox guard (tighter than military's 60°×40° — radius-capped API), honest OFFLINE "view too wide" instead of a silently-cropped world query, 20s poll, no mock fallback. Supersedes the Slice 6b OpenSky/adsb.lol finding (no CORS-usable ADS-B) |
| Signal/correlation engine | **Done** | 6 | ✓ | ✓ | 1°×1° cell co-location of ≥2 event types; panel labeled INFERENCE, contributing events counted, click-to-view; transparent count, no prediction |
| Country risk panel | **Done** | 7→14 | — | ✓ | explainable v1: itemized sum of live GDACS alert weights (Red 3/Orange 2/Green 1) per country, labeled INFERENCE, click-to-view; structural context (population/GDP/income group, vendored Natural Earth) shown per row, kept separate from the score — never blended into one composite number |
| Route Explorer Lite | **Partial** | 7 | — | ✓ | static 9-chokepoint reference + transparent count of current events within 500 km + alternate routes, labeled ADVISORY / "not a routing service"; interactive route drawing not planned for lite |
| Scenario Engine Lite | **Done** | 7 | — | ✓ | 5 prebuilt what-if walkthroughs (static effects w/ historical analogues), labeled SIMULATION; only live element is the transparent nearby-event count |
| Dossier / report workspace | **Done** | 8 | ✓ | — | pin events from the inspector; provider citation frozen at pin time; user notes labeled "user-authored" in exports; export MD/JSON; persisted like monitors/graph |
| Export state (JSON/CSV) | **Done** | 8 | ✓ | ✓ | per-panel: timeline events (CSV+JSON, respects playback window), markets (CSV), dossier (MD+JSON), graph (JSON since Slice 4); all client-side, timestamped filenames |
| Optional AI analyst (BYO key) | **Done** | 9 | — | ✓ | always-on local-rules brief (zero config); optional Anthropic or OpenAI-compatible key, direct-from-browser call; every reply cites events by title, labeled LOCAL RULES / AI · INFERENCE; local keyword refusal for excluded categories runs before any network call; LLM failures fall back to the local brief with the real error shown |
| Privacy controls / clear-data | **Done** | 1→9 | — | ✓ | privacy doc + no-backend; "Clear local data" (two-step confirm) wipes the persisted settings blob + IndexedDB snapshots and reloads |
| Mobile bottom-sheet layout | **Done** | 1→10 | — | ✓ | ≤860px both rails are bottom sheets (grab handle, close button, Escape, overlay tap) opened from status-bar toggles; inspector auto-opens on select |
| Accessibility (kbd, ARIA, contrast, reduced-motion) | **Done** | 1→10 | — | — | audit done: focus-visible outlines, all clickable rows keyboard-operable (shared `pressable` helper), palette combobox/listbox semantics, `prefers-reduced-motion` honored (CSS + map jumpTo), AA contrast verified |
| No production placeholder panels | **Done** | 1 | — | — | every shipped panel is functional; unbuilt features are absent, not "reserved" |
| 2D/3D globe view + fullscreen | **Done** | 11 | ✓ | ✓ | style-level `mercator`↔`globe` toggle (maplibre-gl v5), persisted setting; layers/selection/filters/camera untouched by the switch; whole-app fullscreen |
| Country boundaries + inspector | **Done** | 11→18 | ✓ | ✓ | vendored Natural Earth **50m** (public domain, own-origin, labeled `STATIC DATASET`; 110m omitted microstates — Singapore/Monaco weren't selectable at all), simplified to ~500 KB; click-to-select with white hover highlight, region/capital/population/GDP, itemized country-risk summary, in-country events, timeline filter, graph/dossier bridge |
| Basemap looks (vivid/dark) | **Done** | 18 | — | — | CARTO voyager (colorful, default) ↔ CARTO dark, persisted setting, keyless both |
| Own-device GPS pin (opt-in) | **Done** | 19 | — | — | browser geolocation, rocket pin; position transient, never persisted, never sent anywhere; own device only per privacy policy |
| Day/night terminator | **Done** | 11 | ✓ | — | pure client-side solar-position astronomy, no network/data source; toggleable overlay, persisted setting, recomputed every 5 min |

## Excluded by policy (will not build)
Military targeting, weapon tasking, private-person surveillance/pattern-of-life,
doxxing, people-watchlists, CDR/telecom/SIGINT, biometrics/face-rec, predictive
policing, "propaganda verdicts", real classified data. See `RESEARCH_MATRIX.md`.
| Show/hide side rails | **Done** | P1 | — | ✓ | desktop chevron collapse for both rails, persisted, palette commands; mobile sheets untouched |
| Country alert levels | **Done** | P1 | ✓ | ✓ | derived fill: GDACS weights via computeCountryRisk (monitoring/elevated/high) + static conflict_zones.json (UCDP-derived, source-labeled); DERIVED-tagged toggle + legend |
| DEFCON-style alert chip | **Done** | P1 | ✓ | ✓ | composite index from GDACS/quake/signals, badged DERIVED · UNOFFICIAL with itemized reasons; never presented as official DEFCON |
| Bottom intel dock | **Done** | P1 | ✓ | ✓ | world + regional news (GDELT, keyless CORS), click-to-load YouTube live TV (5 channels, youtube-nocookie), ECB FX, CoinGecko top coins; per-panel LIVE/DEMO badges |
| Stock indices | **Deferred** | — | — | — | no keyless CORS live source; will ship BYO-key later — absent rather than faked |
| Collapsible layer groups | **Done** | P2A | ✓ | ✓ | emoji group headers with caret + enabled count, collapse state persisted |
| Derived overlays (hotspots / chokepoints / trade routes / instability) | **Done** | P2A | ✓ | ✓ | all computed client-side from data already fetched, badged derived/reference; great-circle trade routes between chokepoint pairs; instability = computeCountryRisk ramp |
| Curated static registries (econ centers / AI data centers / nuclear fuel-cycle / sanctions) | **Done** | P2A | ✓ | ✓ | source-labeled vendored JSON with retrieved dates, no invented numeric claims; sanctions two-tier country tint (OFAC/EU/UN public lists), default off |
| Undersea cables | **Deferred** | — | — | — | TeleGeography public GitHub repo is gone (404, checked 2026-07-10); mirrors have unclear licensing — deferred rather than fabricated or license-washed |
| Military bases (OSM Overpass) | **Done** | P2A | ✓ | ✓ | opt-in (default off), in-view debounced bbox query, world-view guard reports honest offline error, no mock fallback |
| 🛰 Orbital surveillance (row 31) | **Done** | P2B, 2026-07-11 | — | ✓ | live satellite positions via CelesTrak active-group TLEs (keyless, ~16k objects, fetched once per session) propagated client-side with SGP4 in a dedicated Web Worker (`src/workers/sgp4.worker.ts`, satellite.js only there), ticking every 2s while tab visible and paused when hidden; opt-in toggle, every card labeled "propagated from TLE epoch (SGP4)" — never presented as a live tracked fix |
