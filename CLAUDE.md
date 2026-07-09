# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Terra Watch v2** — a **civilian OSINT / situational-awareness dashboard**: a
client-side React + TypeScript SPA (Vite) that fetches **public, keyless-first**
open data, normalizes it into a small event ontology, and renders it on a
MapLibre GL map with source-labeled panels. There is **no backend** — everything
runs in the browser.

This is a ground-up rebuild of the original v1 static Three.js globe site, which
is preserved verbatim under `legacy/` (still the live GitHub Pages site on
`main`). **Active work happens on the `rebuild/terra-watch-v2` branch**, not
`main`. Read `docs/SESSION_NOTES.md` first — it records exactly what slice is
done vs in-progress and how to resume.

## Commands

```bash
npm install                      # first time (also: npx playwright install chromium for e2e)
npm run dev                      # Vite dev server → http://localhost:5173
npm run build                    # tsc --noEmit + vite build → dist/
npm run typecheck                # tsc --noEmit (strict)
npm run preview                  # serve the built dist/ (defaults to :4173)

# E2E (Playwright, Chromium headless). A preview/dev server must be running on :4173:
npx vite preview --port 4173 &
npx playwright test                              # full smoke suite
npx playwright test -g "command palette"         # a single test by title
```

There is no lint config yet (planned for Slice 10). This repo runs on a
Raspberry Pi (aarch64); Chromium for Playwright is installed via
`npx playwright install chromium`.

## Architecture

Single-page app; entry `index.html` → `src/main.tsx` → `src/App.tsx` (a CSS-grid
shell: StatusBar / [LayerManager | MapCanvas+TimelineDrawer | InspectorRail] /
ProviderHealthBar, plus a Cmd/Ctrl-K CommandPalette). Full write-up in
`docs/ARCHITECTURE.md`.

**State is one Zustand store** (`src/state/store.ts`) — the single source of
truth for `layers`, `providers` (health), `sources` (per-provider enable),
`monitors`, `events`, and `selected`. It uses the `persist` middleware to save
**only user settings** (source toggles, monitors, per-layer enabled) to
localStorage under `terra-watch:v2`; fetched data is never persisted.

**Data flow:** each provider adapter in `src/lib/providers/*` (`usgs.ts`,
`eonet.ts`) returns a `FetchResult { events, mode, latencyMs, error }`.
`store.refreshAll()` fetches all enabled sources in parallel (`Promise.all`) and
merges results. Components read from the store; `MapCanvas` renders events to a
single MapLibre GeoJSON circle layer.

**The layer model is the key abstraction** (`src/lib/layers.ts`): one provider
can feed many typed layers. `layerIdForEvent` / `isEventVisible` / `eventCounts`
map each `GeoEvent` (by `sourceId` + `type`) to exactly one layer — a named
layer for its type, else that provider's `catchAll` layer. The map, layer
manager (counts + visibility), and everything else derive from these helpers, so
adding an event type is a matter of adding a `LayerDef`, not touching rendering.

## Non-negotiable product conventions

These are the point of the product — preserve them in every change:

- **Never fake "live".** The status-bar data mode (`live` / `cache` / `mock` /
  `offline` / `loading`) is **derived from real fetch results** in
  `overallMode()`, never hardcoded. When a fetch fails, the adapter returns a
  clearly-labeled `mock` sample and the UI must show DEMO/SAMPLE everywhere.
- **Attribute every claim.** Each object shows source, timestamp, and freshness;
  the inspector renders a source card with license + link. Model-generated
  analysis (later slices) must be labeled **inference**, not fact, with citations.
- **Public-OSINT posture, permanently excluded:** weapon targeting or tasking,
  fire control, private-person surveillance / pattern-of-life, doxxing,
  people-watchlists, CDR/telecom/SIGINT ingestion, biometrics/face-rec,
  predictive policing, real classified data. Displaying public open data about
  conflicts and military topics (news, event datasets, reference registries)
  is in scope (amended 2026-07-09). See `docs/PRIVACY_AND_CIVILIAN_USE.md`.
- **Keyless-first.** The app is fully useful with zero config. Any source needing
  a key is optional and user-supplied (stored locally only).
- **No production placeholder panels.** Ship a feature functional or leave it out
  and track it in `docs/GAP_MATRIX.md` — never a "reserved" empty panel.
- **World Monitor is AGPL-3.0: clean-room only.** Do not read or port its source;
  `docs/RESEARCH_MATRIX.md` is a public feature inventory for original design.

## Where things are

- `src/components/` — StatusBar, MapCanvas, LayerManager, ProviderHealthBar,
  InspectorRail, TimelineDrawer, CommandPalette.
- `src/lib/` — `layers.ts` (event→layer model), `format.ts` (clock/relative
  time), `providers/` (adapters + `types.ts` ontology: `GeoEvent`,
  `ProviderHealth`, `DataMode`, `FetchResult`).
- `docs/` — ARCHITECTURE, RESEARCH_MATRIX, GAP_MATRIX (per-capability
  Done/Partial/Deferred), DATA_SOURCES, PRIVACY_AND_CIVILIAN_USE, TEST_REPORT,
  SESSION_NOTES, and `screenshots/`.
- `tests/smoke.spec.ts` — Playwright e2e. `legacy/` — the untouched v1 app.

## Slice-based build

Work proceeds in vertical slices (1–10), each verified (build + typecheck +
Playwright) and committed before the next. Current status and the exact next
steps live in `docs/GAP_MATRIX.md` and `docs/SESSION_NOTES.md` — consult them
before starting, and update them when a slice lands.

## Deploy

Static build. `vite.config.ts` sets `base: './'` so `dist/` works under the
`/terra-watch/` GitHub Pages project subpath. `main` (v1) stays live until this
branch is deliberately merged/deployed; publishing means putting `dist/` on the
Pages branch.
