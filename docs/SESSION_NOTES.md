# Session Notes — Terra Watch v2 rebuild

Working branch: **`rebuild/terra-watch-v2`** (branched off `main`; `main` stays
the live v1 site). Last updated: 2026-07-01.

## Progress

- **Slice 1 — DONE, committed, tested** (`a3de0a9`): React+TS+Vite shell,
  MapLibre keyless dark map, live USGS earthquakes, layer manager, provider
  health bar, inspector w/ source card, timeline drawer, Cmd/Ctrl-K palette.
- **Slice 2 — DONE, committed, tested** (`d469cf3`): NASA EONET provider
  (wildfires/volcanoes/severe storms/other), shared `src/lib/layers.ts` event→
  layer model, generalized map rendering, per-layer counts, type-aware inspector.
- **Slice 3 — WIP, store only, UNVERIFIED at runtime** (this commit): rewrote
  `src/state/store.ts` to add:
  - localStorage persistence via `zustand/middleware` `persist` (persists only
    user settings: source toggles, monitors, per-layer enabled — never fetched
    data). Key: `terra-watch:v2`.
  - `sources` map + `toggleSource` with **fetch-time skipping** of disabled
    providers (events from disabled sources dropped on refresh).
  - `monitors` (custom keyword) state: `addMonitor` / `removeMonitor` + colors.
  - `REGIONS` presets + `flyTo` / `mapCmd` channel for palette-driven map nav.
  - `typecheck passes`; **not built/e2e-tested; no UI wired yet.**

## Slice 3 remaining (next session)

1. **SourceManager UI** — per-source enable/disable (reads/writes `sources`);
   ProviderHealthBar + LayerManager should show disabled sources as "OFF".
2. **Monitors UI** — add/remove keyword monitors; highlight matching events in
   the timeline (and optionally map); show match counts.
3. **CommandPalette expansion** — region fly-to commands (uses `REGIONS`+`flyTo`),
   enable/disable source commands.
4. **MapCanvas** — subscribe to `mapCmd` and call `map.flyTo`.
5. **Tests** — source toggle persists + stops fetch; monitor add highlights;
   palette region command flies map. Update `docs/TEST_REPORT.md` + `GAP_MATRIX.md`.

## Then Slices 4–10
graph workspace · timeline playback/snapshots · intelligence panels + signal
engine · country risk + route/scenario lite · dossier + export · optional AI
analyst · QA/mobile/a11y/deploy. See `docs/GAP_MATRIX.md`.

## Run / verify
```bash
npm install
npm run build                    # tsc --noEmit + vite build
npx playwright install chromium  # once
npx vite preview --port 4173 &
npx playwright test
```
