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
| Timeline (rolling feed) | **Partial** | 1→8 | ✓ | ✓ | Live feed + click-inspect + monitor highlight + 24h scrub/playback (labeled PLAYBACK, filters map too); correlation surfaced via SIGNALS panel, in-timeline markers deferred |
| Normalized ontology | **Partial** | 1→3 | ✓ | ✓ | GeoEvent (typed, categorized) + Provider across 2 providers; entities/relations in later slices |
| Civilian-use disclaimers | **Done** | 1 | — | — | Inspector + privacy language, no militarized copy |
| Search "this view" | **Partial** | 1→3 | ✓ | ✓ | Search box opens palette; view-scoped search still deferred |
| Source manager (per-source toggle) | **Done** | 3 | ✓ | ✓ | fetch-time filtering, OFF shown in health bar + layer rows, persisted to localStorage |
| Custom keyword monitors | **Done** | 3 | — | ✓ | local-persisted; highlights matches in timeline (left border) and on the map (stroke ring) with live match counts |
| Link graph workspace | **Partial** | 4 | ✓ | ✓ | add-to-graph, search-around (proximity+time, source-cited), 3 layouts, JSON export; only geo-events so far, no news/market entities (Slice 6) |
| Snapshots / playback | **Done** | 5 | ✓ | ✓ | IndexedDB baselines, 7-day retention, labeled added/removed delta vs baseline; 24h timeline playback |
| News intelligence panel | **Deferred** | 6b+ | — | ✓ | GDELT dropped (GEO API 404/retired); ReliefWeb dropped as keyless default (needs approved appname); most RSS lacks CORS — needs a browser-usable keyless source or BYO tier |
| Market panel | **Done** | 6b | — | ✓ | keyless FX (ECB via Frankfurter) + BTC/ETH (CoinGecko) in a rail panel; LIVE/SAMPLE label derived from real fetch, per-quote attribution, source toggle |
| Natural events panel | **Partial** | 1,2,6,6b | — | ✓ | quakes (USGS) + wildfires/volcanoes/storms (EONET) + US weather alerts (NWS) + global GDACS disaster alerts (Green/Orange/Red, size-scaled) live; FIRMS next |
| Infrastructure panel | **Done** | 6→12 | ✓ | ✓ | vendored open registries as normal layers: nuclear power plants (WRI Global Power Plant DB) + space launch sites (GCAT), per-source toggle, honestly labeled CACHE (static, not live) |
| Transport panel | **Deferred** | 6b+ | — | ✓ | blocked for keyless browser use (2026-07-02): OpenSky CORS is locked to opensky-network.org; adsb.lol sends no CORS header — needs a browser-usable source |
| Signal/correlation engine | **Done** | 6 | ✓ | ✓ | 1°×1° cell co-location of ≥2 event types; panel labeled INFERENCE, contributing events counted, click-to-view; transparent count, no prediction |
| Country risk panel | **Partial** | 7 | — | ✓ | explainable v1: itemized sum of live GDACS alert weights (Red 3/Orange 2/Green 1) per country, labeled INFERENCE, click-to-view; structural indicators (World Bank) later |
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
| Country boundaries + inspector | **Done** | 11 | ✓ | ✓ | vendored Natural Earth 110m (public domain, own-origin, labeled `STATIC DATASET`); click-to-select, region/capital/population/GDP, itemized country-risk summary, in-country events, timeline filter, graph/dossier bridge |
| Day/night terminator | **Done** | 11 | ✓ | — | pure client-side solar-position astronomy, no network/data source; toggleable overlay, persisted setting, recomputed every 5 min |

## Excluded by policy (will not build)
Military targeting, weapon tasking, private-person surveillance/pattern-of-life,
doxxing, people-watchlists, CDR/telecom/SIGINT, biometrics/face-rec, predictive
policing, "propaganda verdicts", real classified data. See `RESEARCH_MATRIX.md`.
