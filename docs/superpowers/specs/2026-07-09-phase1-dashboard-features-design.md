# Phase 1 — Dashboard features design (F22 pin, rail toggles, country alerts, DEFCON chip, bottom dock)

Date: 2026-07-09
Status: awaiting user review

## Context

The user wants Terra Watch v2 to grow toward a World-Monitor-class dashboard
(37 layers, 37 panels, live news/market feeds). That is too large for one
build, so work is phased:

- **Phase 1 (this spec):** the five concrete features below, each shippable
  and verifiable.
- **Phase 2:** layer catalog expansion — triage all 37 requested layers by
  data availability (keyless live / static dataset / BYO-key / not feasible)
  and implement the feasible set.
- **Phase 3:** the remaining bottom-dock panels from the requested list.

### Policy amendment (decided by user intent, pending explicit confirmation)

The repo's civilian-only convention is amended: Terra Watch displays **public
OSINT about conflicts and military topics** (the same posture as World
Monitor). Still permanently excluded: weapon targeting/tasking, fire control,
private-person surveillance / pattern-of-life, doxxing, biometrics, predictive
policing, classified data. `CLAUDE.md` and `docs/PRIVACY_AND_CIVILIAN_USE.md`
are updated as part of this phase. World Monitor remains AGPL clean-room:
feature inventory only, never its source.

## Feature 1 — F-22 Raptor GPS pin

- Replace `STARSHIP_SVG` in `src/components/MapCanvas.tsx` (~line 37) with an
  original top-down F-22 silhouette (inline SVG, same DOM-marker pipeline).
- Size: 24 px wide (current 26 − 2 requested), height proportional.
- Keep the `.gps-pin` class, tooltip text, and opt-in geolocation flow
  unchanged.
- Update the code comment and the two policy docs (see amendment above).

## Feature 2 — Show/hide side panels

- Store: `railCollapsed: { left: boolean; right: boolean }` in
  `src/state/store.ts`, persisted with the existing `persist` partialize.
- `App.tsx`: chevron toggle buttons on the inner edge of each rail; collapsed
  rail renders as a ~24 px strip containing only the reopen chevron. CSS grid
  column collapses; MapLibre resizes automatically via its container observer.
- Command palette: "Toggle left panels" / "Toggle inspector" entries.
- Mobile bottom-sheet behaviour (`mobileRail`) is untouched.

## Feature 3 — Country alert-level highlighting

- New module `src/lib/alertLevels.ts`:
  - `countryAlertLevels(events, conflictZones) → Map<iso3, Level>` where
    `Level = 'conflict' | 'high' | 'elevated' | 'monitoring'`.
  - High/elevated/monitoring derive from `computeCountryRisk()`
    (`src/lib/risk.ts:23`) score thresholds; exact thresholds tuned so the
    current live dataset yields a sensible spread (roughly top decile = high).
  - `conflict` comes from `public/data/conflict_zones.json` — a small static,
    source-labeled dataset (UCDP/ACLED-derived country list with source +
    retrieval date in the file).
- Map: one `fill` layer over the existing countries GeoJSON, `fill-color` by
  level (conflict `#b3123d` crimson, high `#ff5a52` red, elevated `#ffb454`
  orange, monitoring `#ffe066` yellow), `fill-opacity` 0.25, below event
  circles.
- LayerManager: new toggleable layer "Country alert levels" (default on) with
  a 4-swatch legend. Because this layer is derived (not provider events), it
  is a UI-level toggle in the store (`showAlertLevels`), not a `LayerDef`.
- Inspector: selecting a country shows its level + "derived from public event
  data" attribution.

## Feature 4 — DEFCON-style alert chip

- Real DEFCON is not public; anything live must be honest. New
  `computeAlertIndex(events, signals): { level: 1|2|3|4|5; reasons: string[] }`
  in `src/lib/signals.ts` — composite of GDACS red/orange alert counts, max
  earthquake magnitude, active signal count, conflict-zone activity. Level 5 =
  quiet baseline, 1 = extreme (thresholds documented in code).
- StatusBar: chip `DEFCON n` colored (5 green → 1 red) with a
  `DERIVED · UNOFFICIAL` badge; tooltip lists the `reasons`. Never presented
  as the official U.S. DEFCON.

## Feature 5 — Bottom dock

- New `src/components/BottomDock.tsx` rendered in `App.tsx` between
  `shell-body` and `ProviderHealthBar`; collapsible (header bar with title +
  collapse chevron), ~220 px tall when open, horizontal scroll of mini-panels.
- Mini-panels live in `src/components/dock/`, each ~280–340 px wide, with the
  standard source + data-mode badge (`live`/`mock` DEMO) pattern:
  1. **WorldNews** — GDELT DOC 2.0 API (`api.gdeltproject.org/api/v2/doc/doc`,
     keyless, CORS-open, JSON): latest headlines, source domain + timestamp,
     refresh with the existing 5-min cycle. Mock sample fallback labeled DEMO.
  2. **RegionalNews** — same provider, region tabs: United States / Europe /
     Middle East / Africa / Latin America / Asia-Pacific (GDELT country/theme
     query per tab; queries defined in the provider, not hardcoded in UI).
  3. **YouTubeNews** — `youtube-nocookie.com` iframe live-stream embed; 5
     channel buttons (Sky News, Al Jazeera English, DW News, France 24, ABC
     News). Loads only after an explicit user click ("click to load — loads
     YouTube content") so no third-party request happens silently; note added
     to PrivacyPanel.
  4. **Markets** — reuse/extend the existing `markets` provider: ECB FX
     (already live/keyless). Stock indices have **no reliable keyless CORS
     source** → shipped as clearly-labeled DEMO quotes until a BYO-key source
     is added in a later phase.
  5. **Crypto** — new fetcher in the markets provider using CoinGecko
     (`api.coingecko.com/api/v3/coins/markets`, keyless, CORS-open): top coins,
     price + 24 h change, live badge, mock fallback.
- Store additions: `dock: { open: boolean; panelCollapsed: Record<string, boolean> }`
  (persisted), plus `dockNews`/`dockCrypto` fetch state following the existing
  provider-health pattern so failures surface in ProviderHealthBar.
- New provider adapters follow `src/lib/providers/*` conventions
  (`FetchResult { events?, mode, latencyMs, error }` — news/crypto return
  typed rows rather than `GeoEvent`s; a small parallel `DockFetchResult` type
  in `types.ts`).

## Error handling

- Every new fetcher: timeout + `mode: 'mock'` fallback with labeled sample
  data (existing pattern in `usgs.ts`/`gdacs.ts`).
- YouTube embed failure = iframe's own error UI; channel buttons remain.
- Alert-level layer with no risk data → no fill (never a stale fill).

## Testing / verification

- `npm run typecheck` + `npm run build` green.
- Playwright (`tests/smoke.spec.ts` additions):
  - dock renders; WorldNews shows rows or DEMO badge; Crypto shows rows or
    DEMO badge; YouTube panel shows click-to-load placeholder.
  - left-rail collapse toggle hides the rail and the map still renders.
  - StatusBar contains the DEFCON chip with `DERIVED` badge.
  - country alert fill layer present in map style when toggle on.
  - GPS pin element uses the new SVG (width 24).
- Manual: `npm run dev`, click through each dock panel, toggle rails, select a
  highlighted country, confirm attribution text.

## Out of scope (later phases)

- The 37-layer catalog (Phase 2 triage first).
- The remaining ~30 requested panels (AI Insights/Forecasts, Premium*, WM
  Analyst, etc.) — most need BYO-key AI or paid data; each lands only when it
  can ship functional per the no-placeholder rule.
