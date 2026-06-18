# TERRA-WATCH — Geo-Market Intelligence Dashboard

A single-page, **static** 3D Earth command center with a terminal/HUD aesthetic.
It plots your **live location** on an interactive globe with position telemetry
and a heading compass, and layers on an original *geo-market intelligence* shell:
intel layers, live market/seismic/weather feeds, an entity inspector with a
lightweight ontology, a command palette, a local watchlist, and clear privacy
controls.

No build step. No backend. No package manager. Pure HTML/CSS/ES-modules +
[Three.js](https://threejs.org/) / [Leaflet](https://leafletjs.com/) loaded from
CDNs — drop it on GitHub Pages and it runs. Inspired by dense analytical
dashboards and ontology/operational-awareness concepts; **not** a clone of, and
not affiliated with, any commercial terminal or intelligence product.

## Features

### Globe & navigation (preserved)
- **3D globe** (Three.js): ocean sphere, graticule, country borders + names,
  atmosphere glow, starfield, drag-to-orbit + zoom; 4 visual styles
  (DAY/NIGHT, POLITICAL, RADAR, THREAT).
- **Live GPS**: pulsing location marker, accuracy, altitude, speed, course, UTM
  grid; **◎ Zoom to my location** track mode; **▣ Street level** Leaflet/Esri map
  that takes over on deep zoom. Denied/unsupported → labelled **SIMULATED** fix.
- **Heading compass** with live device orientation where available, view-bearing
  fallback otherwise.
- **Country news**: click a country → lightbox of top-10 recent headlines.

### Dashboard shell (new)
- **Command palette** — `Ctrl/Cmd + K` (or the **⌘K** top-bar button). Fuzzy
  search; commands for locate, switch style, toggle any layer, add to watchlist,
  clear trail, open market feed, street level, clear local data.
- **Intel layers** (left rail) — toggle map overlays: **Market Centers** (8 global
  exchanges), **Watchlist**, **Seismic Events** (live USGS), **Weather**,
  **Geo Events** (mock), **Risk Heat** (mock), **Movement Trail**. Click any
  marker → inspector.
- **Market feed** (right rail) — FX + crypto from live keyless APIs, indices +
  commodities as labelled mock; each card shows price, % change, age, source, and
  a **STALE** badge when data ages out. Loading / degraded / mock states are explicit.
- **Entity inspector** — typed entity card (Location / MarketInstrument / Event /
  Observation …) with key-values, **linked entities** from the ontology, and
  contextual actions (add to watchlist, headlines, remove).
- **Bottom ticker** — rotating BTC / ETH / EUR-USD / index summary + system status.
- **Watchlist & breadcrumb trail** — pinned locations and recent movement, stored
  in **localStorage only**.

### Privacy
- Your location is **processed on-device**; it is **never** sent to a third party
  by default. The only feature that can send coordinates is the optional
  *"Use my location for weather"* checkbox (off by default). With it off, the
  weather layer queries only public sample points (the market centers).
- Watchlist + trail live in `localStorage` under the `tw:` prefix. **⌦ Clear local
  data** wipes them. No backend, analytics, telemetry, or API keys.

## Run locally

Geolocation and ES-module imports require an `http(s)://` origin — `file://` will
not work. Serve the folder:

```bash
python3 -m http.server 8080      # or: npx serve .
```

Open <http://localhost:8080>. Allow location access; denial falls back to a
labelled **SIMULATED** fix. There is no build, lint, or test command.

## Deploy to GitHub Pages

```bash
git add . && git commit -m "Terra Watch dashboard"
git push origin main
```

Then **Settings → Pages → Source: Deploy from a branch → `main` / root**. The site
appears at `https://<you>.github.io/<repo>/` over HTTPS (so geolocation works).
A `.nojekyll` file keeps Pages from rewriting the `js/` module paths.

## Architecture

Build-free native ES modules, imported by `app.js` via the import map in
`index.html`:

```
index.html · styles.css · app.js      (globe, GPS, compass, orchestration)
js/
  util/      storage.js · format.js · distance.js
  data/
    feeds.js                          (orchestrator: real → mock, staleness)
    providers/  types · http · mock · market · weather · earthquake
  ontology/  model.js                 (entities + relationships, market centers)
  ui/        shell · layers · marketFeed · inspector · commandPalette
```

`feeds.js` is the single seam to data: it tries the real keyless API and falls
back to `mockProvider` on any failure, so a real/paid source can later be swapped
in one place.

## Public APIs used (all keyless, CORS-open)

| Feed | Source | Notes |
|------|--------|-------|
| FX | `api.frankfurter.dev` | ECB daily reference rates |
| Crypto | `api.coingecko.com` | public tier; 24h change |
| Earthquakes | `earthquake.usgs.gov` | M2.5+ past-day GeoJSON |
| Weather | `api.open-meteo.com` | sample points; your location only if opted in |
| Country news | `api.rss2json.com` (Google News RSS) | server-side RSS→JSON |
| Country borders | `world-atlas` via unpkg | degrades to graticule if it fails |

Indices and commodities have no free keyless source and are **clearly-labelled
mock** data.

## Known limitations

- Indices/commodities are mock; FX is daily (not intraday); crypto is spot.
- The entity **graph visualization**, full **alerts engine**, and **investigation
  board** are planned for Phase 2 (the inspector shows linked entities today).
- Weather/seismic layers fetch on toggle and refresh periodically while enabled.
- Public APIs can rate-limit; the UI degrades to mock with a visible badge.

## Notes

The classification banner and HUD styling are **cosmetic only** — no government
affiliation, no classified data.
