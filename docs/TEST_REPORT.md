# Test Report

Environment: Node 24.15, npm 11.12, Playwright (Chromium headless), Raspberry Pi
(aarch64). Run date: 2026-07-01.

## Build & typecheck

| Check | Command | Result |
|---|---|---|
| Typecheck (strict) | `tsc --noEmit` | ✅ pass (0 errors) |
| Production build | `vite build` | ✅ pass — `dist/` emitted |

Build output: `index.html` 0.93 kB, CSS 71.6 kB (10.8 kB gz), JS 968 kB
(272 kB gz). The JS chunk-size warning (MapLibre) is tracked for code-splitting
in Slice 10.

## End-to-end (Playwright, `tests/smoke.spec.ts`)

Run against `vite preview` on :4173.

| Test | Asserts | Result |
|---|---|---|
| loads without console errors | shell + `.maplibregl-canvas` + SOURCES render; no app-level console/page errors (benign tile/network noise filtered) | ✅ pass |
| layer toggle works | Earthquakes checkbox checked → unchecked | ✅ pass |
| natural-event layers from EONET present | Wildfires/Volcanoes/Severe-storms checkboxes + EONET health chip visible | ✅ pass |
| command palette opens via Ctrl+K | dialog + command input visible | ✅ pass |
| mobile viewport renders | shell visible at 390×844 | ✅ pass |

**5 passed / 0 failed.** Screenshots written to `docs/screenshots/`.

### Verified behavior (from the passing run + captured snapshot)
- USGS **live**: ~36 earthquakes; NASA EONET **live**: 200 natural events
  (186 wildfires, 9 volcanoes, 2 severe storms, 3 other) — color-coded per layer.
- Status pill showed **LIVE · PUBLIC OSINT** (derived from both providers, not hardcoded).
- Provider health bar showed `USGS LIVE 36` + `NASA EONET LIVE 200` with latency + freshness.
- Per-layer counts render in the layer manager; timeline shows 200 events.
- No "reserved"/placeholder panels present.

## Coverage gaps (planned)
E2E for graph, timeline filters/playback, source manager, custom monitors, route
& scenario simulations, dossier export, and full accessibility/mobile-bottom-sheet
land with their respective slices (4–10), per `docs/GAP_MATRIX.md`. Linting
(ESLint) config is planned for Slice 10.

## How to reproduce
```bash
npm install
npm run build                 # typecheck + build
npx playwright install chromium
npx vite preview --port 4173 & # serve dist
npx playwright test           # run smoke suite
```
