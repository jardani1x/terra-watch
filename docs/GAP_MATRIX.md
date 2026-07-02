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
| Infrastructure panel | **Deferred** | 6 | ✓ | ✓ | open registries only |
| Transport panel | **Deferred** | 6b+ | — | ✓ | blocked for keyless browser use (2026-07-02): OpenSky CORS is locked to opensky-network.org; adsb.lol sends no CORS header — needs a browser-usable source |
| Signal/correlation engine | **Done** | 6 | ✓ | ✓ | 1°×1° cell co-location of ≥2 event types; panel labeled INFERENCE, contributing events counted, click-to-view; transparent count, no prediction |
| Country risk panel | **Partial** | 7 | — | ✓ | explainable v1: itemized sum of live GDACS alert weights (Red 3/Orange 2/Green 1) per country, labeled INFERENCE, click-to-view; structural indicators (World Bank) later |
| Route Explorer Lite | **Partial** | 7 | — | ✓ | static 9-chokepoint reference + transparent count of current events within 500 km + alternate routes, labeled ADVISORY / "not a routing service"; interactive route drawing not planned for lite |
| Scenario Engine Lite | **Done** | 7 | — | ✓ | 5 prebuilt what-if walkthroughs (static effects w/ historical analogues), labeled SIMULATION; only live element is the transparent nearby-event count |
| Dossier / report workspace | **Deferred** | 8 | ✓ | — | citations preserved, export MD/JSON |
| Export state (JSON/CSV) | **Deferred** | 8 | ✓ | ✓ | per-panel export |
| Optional AI analyst (BYO key) | **Deferred** | 9 | — | ✓ | cite sources; refuse unsafe; local rules fallback |
| Privacy controls / clear-data | **Partial** | 1→9 | — | ✓ | privacy doc + no-backend; UI clear-data in Slice 9 |
| Mobile bottom-sheet layout | **Partial** | 1→10 | — | ✓ | responsive rails done; bottom-sheet polish in Slice 10 |
| Accessibility (kbd, ARIA, contrast, reduced-motion) | **Partial** | 1→10 | — | — | ARIA labels + focusable controls in; full audit Slice 10 |
| No production placeholder panels | **Done** | 1 | — | — | every shipped panel is functional; unbuilt features are absent, not "reserved" |

## Excluded by policy (will not build)
Military targeting, weapon tasking, private-person surveillance/pattern-of-life,
doxxing, people-watchlists, CDR/telecom/SIGINT, biometrics/face-rec, predictive
policing, "propaganda verdicts", real classified data. See `RESEARCH_MATRIX.md`.
