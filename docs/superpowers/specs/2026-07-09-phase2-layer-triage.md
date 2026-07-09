# Phase 2 — 37-layer catalog triage

Date: 2026-07-09 · Status: awaiting user tranche selection

Each requested layer triaged by data availability. Categories:
**done** (already shipped) · **derived** (computable from existing data) ·
**static** (vendor a public dataset) · **keyless** (live API, CORS probe at
build time) · **BYO-key** (user-supplied key) · **skip** (no honest source).

| # | Layer | Verdict | Source / plan |
|---|-------|---------|---------------|
| 1 | 🎯 IRAN ATTACKS | keyless | GDELT geo API filtered to Iran/Israel theater; news-derived accuracy labeled |
| 2 | 🎯 INTEL HOTSPOTS | derived | expose existing `computeSignals` co-location cells as a map layer |
| 3 | ⚔ CONFLICT ZONES | done + keyless | country fill shipped (P1); event-level via UCDP candidate-events API (keyless, monthly) |
| 4 | 🏛 MILITARY BASES | keyless | OSM Overpass `military=*` (v1 legacy already proved this pattern) |
| 5 | ☢ NUCLEAR SITES | done + static | plants shipped; add enrichment/fuel-cycle sites (NTI public data, curated) |
| 6 | ⚠ GAMMA IRRADIATORS | skip | no open registry; can't ship honest |
| 7 | ☢ RADIATION WATCH | keyless (probe) | Safecast API; fallback skip if no CORS |
| 8 | 🚀 SPACEPORTS | done | launch-sites layer (GCAT) |
| 9 | 🔌 UNDERSEA CABLES | static | TeleGeography submarine-cable GeoJSON (CC-licensed GitHub mirror), vendored |
| 10 | 🛢 PIPELINES | static | Global Energy Monitor public dataset, major pipelines subset |
| 11 | 🏗 STORAGE FACILITIES | static (subset) | GEM oil/gas storage subset; else fold into pipelines layer |
| 12 | ⚙ FUEL SHORTAGES | skip | no keyless live source exists |
| 13 | 🖥 AI DATA CENTERS | static | curated list from public reporting, source-labeled |
| 14 | ✈ MILITARY ACTIVITY | keyless (probe) | airplanes.live /v2/mil endpoint (v1 used this feed) |
| 15 | 🚢 SHIP TRAFFIC | BYO-key | AISStream.io key (v1 pattern); no keyless AIS exists |
| 16 | ⚓ TRADE ROUTES | derived/static | extend existing `chokepoints.ts` with great-circle route lines |
| 17 | ✈ AVIATION | keyless | airplanes.live bbox feed |
| 18 | 📢 PROTESTS | keyless | GDELT protest theme, geo-tagged; news-derived, labeled |
| 19 | ⚔ ARMED CONFLICT EVENTS | keyless | UCDP GED candidate API |
| 20 | 👥 DISPLACEMENT FLOWS | keyless (probe) | UNHCR population API — country-level choropleth/arrows |
| 21 | 🌫 CLIMATE ANOMALIES | derived (partial) | Open-Meteo vs climatology delta at sample grid; modest honest version |
| 22 | ⛈ WEATHER ALERTS | done (US) + keyless | NWS shipped; add MeteoAlarm Europe CAP if CORS |
| 23 | 📡 INTERNET DISRUPTIONS | BYO-key | Cloudflare Radar (free key); IODA probe as keyless alt |
| 24 | 🛡 CYBER THREATS | skip (probe) | abuse.ch feeds usually lack CORS; revisit if probe passes |
| 25 | 🌋 NATURAL EVENTS | done | EONET/USGS/GDACS |
| 26 | 🔥 FIRES | done | EONET wildfires + FIRMS BYO-key WMS |
| 27 | ⚓ CHOKEPOINTS | derived | `chokepoints.ts` exists (Route Explorer) — expose as layer |
| 28 | 💰 ECONOMIC CENTERS | static | exchanges/financial centers (v1 ontology had these) |
| 29 | 💎 CRITICAL MINERALS | static | USGS MRDS subset (major deposits) |
| 30 | 📡 GPS JAMMING | skip (license) | gpsjam.org data license unclear; revisit with permission |
| 31 | 🛰 ORBITAL SURVEILLANCE | keyless | CelesTrak TLE + satellite.js SGP4 (v1 pattern) |
| 32 | 🌎 CII INSTABILITY | derived | own instability score from risk.ts inputs — labeled DERIVED, not the proprietary index |
| 33 | 📈 RESILIENCE | static | ND-GAIN country index (public), choropleth |
| 34 | 🚫 SANCTIONS | static | country-level sanctions-programs list (OFAC/EU/UN public summaries), choropleth |
| 35 | 🌓 DAY / NIGHT | done | terminator toggle |
| 36 | 📷 LIVE WEBCAMS | BYO-key | Windy Webcams API key |
| 37 | 🦠 DISEASE OUTBREAKS | keyless (probe) | WHO Disease Outbreak News API; GDELT health theme fallback |

## Proposed build tranches

- **Tranche A — derived + static (no new live APIs, fastest):** intel hotspots,
  chokepoints, trade routes, economic centers, undersea cables, pipelines (+storage subset),
  AI data centers, nuclear-sites extension, military bases (Overpass), critical minerals,
  CII-instability (derived), resilience, sanctions choropleth. ~13 layers.
- **Tranche B — keyless live (CORS probes first):** aviation, military activity,
  orbital surveillance, UCDP armed-conflict events (+Iran theater filter), protests,
  displacement flows, radiation watch, disease outbreaks, MeteoAlarm. ~9 layers.
- **Tranche C — BYO-key:** ship traffic (AISStream), internet disruptions (Cloudflare),
  live webcams (Windy). ~3 layers.
- **Skipped (no honest source):** gamma irradiators, fuel shortages, cyber threats,
  GPS jamming — recorded in GAP_MATRIX as Deferred with reasons.

Layer-manager UX: with ~35+ layers, groups become collapsible sections with the
requested emoji labels; group state persisted.
