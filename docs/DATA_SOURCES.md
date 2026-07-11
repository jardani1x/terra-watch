# Data Sources

Terra Watch uses **public, open, keyless-first** data. Every source is attributed
in-app (provider health bar + inspector source card) and labeled with its current
mode: `live` (fetched OK this session), `cache`, `mock` (labeled sample /
offline fallback), or `offline`.

## Implemented

| Source | Data | Auth | License / attribution | Mode handling | Slice |
|---|---|---|---|---|---|
| **USGS Earthquakes** | M2.5+ quakes, past 24h (GeoJSON) | none | USGS / U.S. public domain | Live; on failure → labeled `mock` sample | 1 |
| **NASA EONET v3** | open natural events (wildfires, volcanoes, severe storms, +) | none | NASA EONET (courtesy NASA Earth Observatory) | Live; on failure → labeled `mock` sample | 2 |
| **NOAA NWS Alerts** | active US weather alerts (polygon-mapped only; zone-only alerts are skipped, not guessed) | none | NOAA/NWS — U.S. Government public domain | Live; on failure → labeled `mock` sample | 6 |
| **GDACS Disasters** | global multi-hazard disaster alerts (cyclones, floods, quakes, droughts, wildfires) with Green/Orange/Red levels | none | GDACS — EC Joint Research Centre / UN OCHA | Live; on failure → labeled `mock` sample | 6b |
| **Frankfurter (ECB FX)** | daily ECB reference rates USD→EUR/JPY/GBP/CNY (MARKETS panel, not the map) | none | ECB reference rates via Frankfurter | Live; on failure → labeled `mock` sample | 6b |
| **CoinGecko** | BTC/ETH spot + 24h change (MARKETS panel, not the map) | none (rate-limited free tier) | price data by CoinGecko (attribution shown in panel) | Live; on failure → labeled `mock` sample | 6b |
| **CARTO dark basemap** | raster map tiles | none | © OpenStreetMap contributors © CARTO (shown on map) | Basemap only, not an event source | 1 |
| **AI analyst (Anthropic / OpenAI-compatible)** | cited, inference-labeled Q&A over the current public feed | none required (BYO key optional) | user's own provider account | Always-on local-rules brief with zero key; optional key calls the provider **directly from the browser** (no Terra Watch backend); LLM failures fall back to the local brief with the real error shown, never hidden | 9 |
| **airplanes.live** | live ADS-B aircraft (point + radius query, in-view) | none (keyless) | airplanes.live — non-commercial use, attribution shown in inspector | CORS `*` verified 2026-07-10; opt-in layer, default OFF; radius-capped at ≤250 nm, so the store computes the circumscribed-circle radius needed to cover the current view (a cheap 12°×8° bbox pre-check skips obviously world-sized views first) and refuses honestly with an OFFLINE "view too wide" whenever that radius exceeds 250 nm, instead of silently showing only the center chunk; polled every 20 s (well under the API's ~1 req/s ceiling); no mock fallback | Phase 2B |
| **CelesTrak** | active-catalog satellite GP element sets (TLE format), positions computed client-side via SGP4 | none (keyless) | CelesTrak (T.S. Kelso) — public data, attribution shown in inspector | CORS `*` verified 2026-07-10; ~2.69 MB / 15,985 objects, fetched **once per session** (not polled) to stay well clear of CelesTrak's rate limiting; propagation runs in a dedicated Web Worker (`src/workers/sgp4.worker.ts`, the app's first) via `satellite.js`, ticking every 2 s while the tab is visible; every rendered position and inspector card is labeled "propagated from TLE epoch (SGP4)" — never presented as a live tracked fix | Phase 2B |

- USGS feed: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson`
- EONET feed: `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=200`
- NWS feed: `https://api.weather.gov/alerts/active?status=actual` (marker = centroid of
  the alert polygon, noted in the inspector)
- GDACS feed: `https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP` (each event's
  `Point_Centroid` feature only — polygon/track duplicates are skipped; marker size
  scales with the Green/Orange/Red alert level; centroid placement noted in the inspector)

## Planned (later slices — keyless open data first)

| Source | Data | Auth | Slice |
|---|---|---|---|
| GDELT | global news/event stream | none (rate-limited) | dropped 2026-07-02: GEO API endpoint now returns 404 (retired); DOC API is 1 req/5 s and carries no coordinates |
| ReliefWeb | humanitarian reports/news | approved appname required | dropped as keyless default 2026-07-02: v2 API returns 403 without an approved appname; could return as an optional BYO-appname source |
| NASA FIRMS | active wildfire detections (hi-res) | key (free) → optional | 6b+ |
| Open-Meteo | weather (global forecast) | none | 6b+ |
| ~~OpenSky~~ | aircraft ADS-B | anonymous tier | dropped 2026-07-02: CORS locked to `opensky-network.org` — unusable from a browser client (adsb.lol probed too: no CORS header at all). **Superseded 2026-07-10**: transport is now unblocked via airplanes.live (see Implemented, above) — the "no CORS-usable ADS-B" finding no longer applies. |
| ~~Celestrak TLE + SGP4~~ | satellite positions (computed in-browser) | none | shipped 2026-07-10 — see Implemented, above |
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
