# Gap Matrix

Status of each mandated capability. Updated after Slice 4. Honest labels:
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
| Timeline (rolling feed) | **Partial** | 1→5 | ✓ | ✓ | Live feed + click-inspect + monitor-match highlight; time filters/playback/correlation in Slice 5 |
| Normalized ontology | **Partial** | 1→3 | ✓ | ✓ | GeoEvent (typed, categorized) + Provider across 2 providers; entities/relations in later slices |
| Civilian-use disclaimers | **Done** | 1 | — | — | Inspector + privacy language, no militarized copy |
| Search "this view" | **Partial** | 1→3 | ✓ | ✓ | Search box opens palette; view-scoped search still deferred |
| Source manager (per-source toggle) | **Done** | 3 | ✓ | ✓ | fetch-time filtering, OFF shown in health bar + layer rows, persisted to localStorage |
| Custom keyword monitors | **Done** | 3 | — | ✓ | local-persisted; highlights matches in timeline (left border) and on the map (stroke ring) with live match counts |
| Link graph workspace | **Partial** | 4 | ✓ | ✓ | add-to-graph, search-around (proximity+time, source-cited), 3 layouts, JSON export; only geo-events so far, no news/market entities (Slice 6) |
| Snapshots / playback | **Deferred** | 5 | ✓ | ✓ | IndexedDB baselines |
| News intelligence panel | **Deferred** | 6 | — | ✓ | GDELT/RSS with source tiers |
| Market panel | **Deferred** | 6 | — | ✓ | free-tier / BYO key |
| Natural events panel | **Partial** | 1,2→6 | — | ✓ | quakes (USGS) + wildfires/volcanoes/storms (EONET) live; FIRMS/weather next |
| Infrastructure panel | **Deferred** | 6 | ✓ | ✓ | open registries only |
| Transport panel | **Deferred** | 6 | — | ✓ | OpenSky ADS-B |
| Signal/correlation engine | **Deferred** | 6 | ✓ | ✓ | transparent, source-cited, labeled inference |
| Country risk panel | **Deferred** | 7 | — | ✓ | explainable v1 score, component breakdown |
| Route Explorer Lite | **Deferred** | 7 | — | ✓ | chokepoints, disruption, alternates; labeled simulation |
| Scenario Engine Lite | **Deferred** | 7 | — | ✓ | prebuilt what-ifs; labeled simulation |
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
