# Terra Watch — Civilian OSINT Dashboard (v2 rebuild)

A **civilian open-source-intelligence situational-awareness dashboard** built on
**public, keyless-first** data. Terra Watch renders an interactive world map,
normalizes public feeds into an event/entity ontology, and shows every claim with
its **source, timestamp, freshness, and data mode** — with **no fake "live"
labels**.

> **Civilian use only.** Not an emergency-authority source. No targeting, no
> surveillance of individuals, no people-watchlists. See
> [`docs/PRIVACY_AND_CIVILIAN_USE.md`](docs/PRIVACY_AND_CIVILIAN_USE.md).

This is an **original product**. It is informed by *public* documentation of
platforms like Palantir Gotham and World Monitor (see
[`docs/RESEARCH_MATRIX.md`](docs/RESEARCH_MATRIX.md)) but copies no proprietary
feature, branding, or source code. World Monitor is AGPL-3.0 and was **not**
read or ported.

## Status

Rebuilt from the ground up as a React + TypeScript + Vite SPA (the original v1
static Three.js globe is preserved under [`legacy/`](legacy/)). Delivered in
vertical slices — see [`docs/GAP_MATRIX.md`](docs/GAP_MATRIX.md) for exactly
what is **Done / Partial / Deferred**.

**Slice 1 (shipped & tested):** app shell · MapLibre map · grouped layer manager
· provider health/freshness bar · derived data-mode pill · object inspector with
source card · rolling event timeline · Cmd/Ctrl-K command palette · live USGS
earthquake layer with labeled offline fallback.

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173
```

## Build & test

```bash
npm run build                    # tsc --noEmit + vite build → dist/
npx playwright install chromium  # once
npx vite preview --port 4173 &   # serve the build
npx playwright test              # smoke suite → docs/screenshots/
```

See [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md) for the latest results.

## Deploy to GitHub Pages

The build is a static bundle. `vite.config.ts` sets `base: './'` so it works
under the `/terra-watch/` project subpath.

1. `npm run build`
2. Publish the contents of `dist/` to your Pages branch (e.g. `gh-pages`), or add
   a GitHub Actions workflow that runs the build and deploys `dist/`.

The current live v1 site stays on `main`; this rebuild lives on
`rebuild/terra-watch-v2` and only changes the live site when you merge/deploy it.

## Documentation

| Doc | Contents |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, layout, data flow, ontology, directory map |
| [RESEARCH_MATRIX.md](docs/RESEARCH_MATRIX.md) | Gotham & World Monitor public-capability research + exclusions |
| [GAP_MATRIX.md](docs/GAP_MATRIX.md) | Per-capability Done/Partial/Deferred status |
| [DATA_SOURCES.md](docs/DATA_SOURCES.md) | Source catalog, licenses, keyless-first policy |
| [PRIVACY_AND_CIVILIAN_USE.md](docs/PRIVACY_AND_CIVILIAN_USE.md) | Privacy model + civilian-use limits |
| [TEST_REPORT.md](docs/TEST_REPORT.md) | Build, typecheck, and e2e results |

## Data honesty

Data mode (`LIVE` / `DEMO` / `DEGRADED`) is derived from real fetch results.
Sample/offline data is labeled everywhere it appears. Later analytical features
(signal engine, risk scores, AI briefs) will be labeled **inference**, not fact,
and cite their sources.
