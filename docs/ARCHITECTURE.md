# Architecture

Terra Watch v2 is a **client-side React + TypeScript SPA** built with Vite. It
fetches public open data directly from the browser, normalizes it into a small
event/entity ontology, and renders it on a MapLibre GL map with source-labeled
panels. There is **no Terra Watch backend** — everything runs in the user's
browser, keyless-first.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite 6 | Fast, modern, static output for GitHub Pages |
| UI | React 18 + TypeScript (strict) | Component model + cross-panel type safety |
| Map | MapLibre GL 4 | Performant WebGL map, keyless (CARTO dark raster tiles) |
| State | Zustand 5 | Minimal cross-panel store without boilerplate |
| Tests | Playwright | Real-browser smoke/e2e |

## Layout (`src/App.tsx`)

A CSS grid app shell:

```
┌─ StatusBar ─────────── brand · mode pill · search · ⌘K · UTC clock ─┐
├─ LayerManager │        MapCanvas + TimelineDrawer        │ Inspector ┤
└─ ProviderHealthBar ── per-source status · items · latency · freshness ┘
```

- **StatusBar** — brand, **data-mode pill** (LIVE / DEMO / DEGRADED, *derived
  from provider health, never hardcoded*), search (opens palette), UTC clock.
- **LayerManager** (left rail) — grouped layer toggles, each with a freshness
  dot, provider name, item count, "last updated".
- **MapCanvas** — MapLibre map; earthquakes as a GeoJSON circle layer colored/
  sized by magnitude; click-to-select drives the inspector.
- **TimelineDrawer** — collapsible rolling event feed, newest first, click-to-inspect.
- **InspectorRail** (right rail) — selected object detail + **source card**
  (status, license, authoritative link) + civilian-use disclaimer.
- **ProviderHealthBar** — every provider's status/latency/itemCount/freshness + refresh.
- **CommandPalette** — Cmd/Ctrl-K modal; commands generated from live state.

## Data flow

```
provider adapter (src/lib/providers/*)  ──fetch──►  FetchResult { events, mode, latencyMs, error }
        │                                                   │
        │ live | mock fallback (labeled)                    ▼
        └──────────────────────────►  Zustand store (events, providers, layers, selected)
                                              │
                        ┌─────────────────────┼─────────────────────┐
                     MapCanvas            LayerManager /          Inspector /
                     (GeoJSON)            HealthBar (status)      Timeline (detail)
```

Each provider adapter returns a `DataMode` (`live | cache | mock | offline |
loading`). The store never invents a mode: if a fetch fails, the adapter returns
its labeled `mock` sample and the UI shows DEMO/SAMPLE everywhere.

## Ontology (Slice 1 seed — grows in Slice 2)

`GeoEvent { id, type, lon, lat, title, time, magnitude?, sourceId, props, url }`
plus `ProviderHealth`. Later slices add Entity types (country, asset, route,
chokepoint) and Relationships (located_at, affects, near, correlated_with) per
`docs/RESEARCH_MATRIX.md`.

## Directory map

```
index.html            Vite entry
src/
  main.tsx, App.tsx    bootstrap + shell
  index.css            design tokens + layout
  state/store.ts       Zustand store (single source of truth)
  lib/
    format.ts          clock / relative-time helpers
    providers/
      types.ts         GeoEvent, ProviderHealth, DataMode, FetchResult
      usgs.ts          USGS earthquakes adapter (live + labeled mock)
  components/          StatusBar, MapCanvas, LayerManager, ProviderHealthBar,
                       InspectorRail, TimelineDrawer, CommandPalette
tests/smoke.spec.ts    Playwright smoke suite
legacy/                the original v1 static globe site (preserved, not built)
docs/                  this documentation set + screenshots/
```

## Build & deploy

`npm run build` → `dist/`. Deployment is a static publish of `dist/` to GitHub
Pages (see `README.md`). `base: './'` keeps assets working under the
`/terra-watch/` project subpath. The v1 site remains on the `main` branch; this
rebuild lives on `rebuild/terra-watch-v2` and does not change the live site
until merged.

## Known scaling notes

- Bundle is ~968 kB (MapLibre) — Slice 10 will code-split heavy panels and lazy
  load the map.
- Marker clustering, list virtualization, and provider-response caching are
  planned for the intelligence/timeline slices as data volume grows.
