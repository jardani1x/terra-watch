# Data Sources

Terra Watch uses **public, open, keyless-first** data. Every source is attributed
in-app (provider health bar + inspector source card) and labeled with its current
mode: `live` (fetched OK this session), `cache`, `mock` (labeled sample /
offline fallback), or `offline`.

## Implemented (Slice 1)

| Source | Data | Auth | License / attribution | Mode handling |
|---|---|---|---|---|
| **USGS Earthquakes** | M2.5+ quakes, past 24h (GeoJSON) | none | USGS / U.S. public domain | Live fetch; on failure → 3-point labeled `mock` sample |
| **CARTO dark basemap** | raster map tiles | none | © OpenStreetMap contributors © CARTO (shown on map) | Basemap only, not an event source |

USGS feed: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson`

## Planned (later slices — keyless open data first)

| Source | Data | Auth | Slice |
|---|---|---|---|
| GDELT | global news/event stream | none (rate-limited) | 6 (news/signals) |
| NASA EONET | natural-event catalog (storms, volcanoes) | none | 2 |
| NASA FIRMS | active wildfire detections | key (free) → optional | 2 |
| Open-Meteo | weather / alerts | none | 6 |
| OpenSky | aircraft ADS-B | anonymous tier (rate-limited) | 6 (transport) |
| Celestrak TLE + SGP4 | satellite positions (computed in-browser) | none | Phase 2 |
| REST Countries / Natural Earth | country metadata + boundaries | none | 2/7 |
| World Bank / FRED | structural indicators for risk score | none/free key | 7 (country risk) |
| AISStream | vessel AIS | **user-supplied key** | Phase 2 (opt-in) |
| Market data | prices/indices | free tier / BYO key | 6 (markets) |

## Principles

1. **Keyless-first.** The app is fully useful with zero configuration. Any source
   needing a key is optional and clearly gated behind user-supplied config
   (stored locally only — see `docs/PRIVACY_AND_CIVILIAN_USE.md`).
2. **No fake live.** Mode is derived from actual fetch results. Sample/offline
   data is labeled DEMO / SAMPLE in the layer row, status bar, and source card.
3. **Every claim attributed.** Provider name, license, timestamp, and (where
   available) a link to the authoritative record accompany each object.
4. **Open licenses only.** No scraping of paywalled/ToS-restricted feeds; no
   ingestion of private/personal data.
