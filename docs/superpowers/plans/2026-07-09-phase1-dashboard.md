# Phase 1 Dashboard Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the five approved Phase 1 features: F-22 GPS pin, side-rail show/hide, country alert-level highlighting, derived DEFCON-style chip, and a bottom dock with five working mini-panels (World News, Regional News, YouTube News, Markets, Crypto).

**Architecture:** All state lives in the existing Zustand store (`src/state/store.ts`, persist middleware). New data comes from two keyless CORS-open providers (GDELT DOC 2.0 for news, CoinGecko for crypto) following the existing `FetchResult` mock-fallback pattern. Map changes are additive MapLibre layers in `MapCanvas.tsx`. Dock is a new collapsible pane in the shell grid.

**Tech Stack:** React 18 + TypeScript (strict), Zustand 5, MapLibre GL 5, Vite 6, Playwright e2e. No new npm dependencies.

## Global Constraints

- Never fake "live": every fetcher returns `mode: 'mock'` with labeled sample data on failure; UI shows DEMO badge (existing convention).
- Attribute every claim: source + timestamp on all rows; derived values badged `DERIVED`.
- Keyless-first: no API keys anywhere in this phase.
- No new npm dependencies.
- Excluded regardless of policy amendment: targeting/tasking, person-surveillance, doxxing.
- Verify loop per task: `npm run typecheck` green, then targeted `npx playwright test -g "<name>"` (preview server on :4173), commit.
- Branch: `feature/phase1-dashboard` (already checked out).
- Windows repo path: `C:\Users\jun yi\Documents\global\terra-watch`.

---

### Task 1: F-22 GPS pin + policy doc amendment

**Files:**
- Modify: `src/components/MapCanvas.tsx:34-49` (SVG constant + comment)
- Modify: `CLAUDE.md` ("Non-negotiable product conventions" civilian bullet)
- Modify: `docs/PRIVACY_AND_CIVILIAN_USE.md` (same amendment)

**Interfaces:**
- Consumes: existing `.gps-pin` DOM-marker pipeline (unchanged).
- Produces: `F22_SVG` string constant replacing `STARSHIP_SVG` (referenced once, in the marker creation ~line 342 block — rename both uses).

- [ ] **Step 1: Replace the SVG constant**

In `src/components/MapCanvas.tsx`, replace the whole `STARSHIP_SVG` block (comment + constant, lines 34–49) with:

```tsx
// GPS pin artwork: a top-down F-22 silhouette (original artwork, public-OSINT
// posture — see PRIVACY_AND_CIVILIAN_USE). Inline SVG so no sprite/image
// pipeline is needed. 24 px wide per spec (was 26).
const F22_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="30" viewBox="0 0 24 30" aria-hidden="true">
  <path d="M12 0 L13.6 5 L13.6 11 L12 13 L10.4 11 L10.4 5 Z" fill="#4a545e"/>
  <path d="M12 3.2 L13 5.6 L12 7.6 L11 5.6 Z" fill="#1e2530"/>
  <path d="M10.4 9 L1 16.5 L1 19 L10.4 16 Z" fill="#39424b"/>
  <path d="M13.6 9 L23 16.5 L23 19 L13.6 16 Z" fill="#39424b"/>
  <path d="M10.4 11 L10.4 24 L13.6 24 L13.6 11 L12 13 Z" fill="#4a545e"/>
  <path d="M9.4 18 L5.5 25.5 L7 26.5 L10.4 21.5 Z" fill="#2f3841"/>
  <path d="M14.6 18 L18.5 25.5 L17 26.5 L13.6 21.5 Z" fill="#2f3841"/>
  <path d="M10.4 24 L8.5 29 L11 27.5 Z" fill="#39424b"/>
  <path d="M13.6 24 L15.5 29 L13 27.5 Z" fill="#39424b"/>
  <rect x="10.9" y="24.5" width="2.2" height="3" rx="1" fill="#8a5a2b"/>
</svg>`;
```

Then update the single usage site (search `STARSHIP_SVG` — it is interpolated into the marker element's innerHTML near line 342): rename to `F22_SVG`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` — Expected: exit 0.

- [ ] **Step 3: Amend the two policy docs**

In `CLAUDE.md`, replace the bullet beginning `- **Civilian-only, permanently excluded:**` with:

```markdown
- **Public-OSINT posture, permanently excluded:** weapon targeting or tasking,
  fire control, private-person surveillance / pattern-of-life, doxxing,
  people-watchlists, CDR/telecom/SIGINT ingestion, biometrics/face-rec,
  predictive policing, real classified data. Displaying public open data about
  conflicts and military topics (news, event datasets, reference registries)
  is in scope. See `docs/PRIVACY_AND_CIVILIAN_USE.md`.
```

In `docs/PRIVACY_AND_CIVILIAN_USE.md`, find the equivalent civilian-only paragraph/section and apply the same amendment (public-OSINT-about-military-topics in scope; the exclusion list verbatim above; note the amendment date 2026-07-09).

- [ ] **Step 4: Commit**

```bash
git add src/components/MapCanvas.tsx CLAUDE.md docs/PRIVACY_AND_CIVILIAN_USE.md
git commit -m "Feat: F-22 GPS pin (24px) + public-OSINT policy amendment"
```

---

### Task 2: Side-rail show/hide

**Files:**
- Modify: `src/state/store.ts` (state + action + partialize/merge)
- Modify: `src/App.tsx` (toggle buttons, grid classes)
- Modify: `src/index.css` (collapsed rail styles)
- Modify: `src/components/CommandPalette.tsx` (two commands)
- Test: `tests/smoke.spec.ts`

**Interfaces:**
- Produces: store `railCollapsed: { left: boolean; right: boolean }` and `toggleRail(side: 'left' | 'right'): void` — used by App.tsx, CommandPalette, and later tasks' tests.

- [ ] **Step 1: Write the failing test**

Append to `tests/smoke.spec.ts`:

```ts
test('side rails collapse and reopen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TERRA WATCH', { exact: true })).toBeVisible();
  // left rail visible, then collapse it
  await expect(page.getByRole('checkbox', { name: 'Earthquakes (M2.5+, 24h)' })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse left panels' }).click();
  await expect(page.getByRole('checkbox', { name: 'Earthquakes (M2.5+, 24h)' })).not.toBeVisible();
  // reopen
  await page.getByRole('button', { name: 'Expand left panels' }).click();
  await expect(page.getByRole('checkbox', { name: 'Earthquakes (M2.5+, 24h)' })).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build; npx vite preview --port 4173 &` then `npx playwright test -g "side rails collapse"`
Expected: FAIL — "Collapse left panels" button not found.

- [ ] **Step 3: Store changes**

In `src/state/store.ts`:

Add to `AppState` interface (after `mobileRail`):

```ts
  /** desktop rail collapse (persisted user setting); mobileRail is separate */
  railCollapsed: { left: boolean; right: boolean };
```
and with the actions:
```ts
  toggleRail: (side: 'left' | 'right') => void;
```

Add to the store initializer (after `mobileRail: null,`):

```ts
      railCollapsed: { left: false, right: false },
```

Add the action (near `setMobileRail`):

```ts
      toggleRail: (side) =>
        set((s) => ({ railCollapsed: { ...s.railCollapsed, [side]: !s.railCollapsed[side] } })),
```

Persist it — in `partialize` add:

```ts
        railCollapsed: s.railCollapsed,
```

and in the `merge` persisted type add `railCollapsed?: { left: boolean; right: boolean };`, and to the returned object:

```ts
          railCollapsed: p.railCollapsed ?? current.railCollapsed,
```

- [ ] **Step 4: App.tsx wiring**

In `App.tsx` add selectors:

```tsx
  const railCollapsed = useStore((s) => s.railCollapsed);
  const toggleRail = useStore((s) => s.toggleRail);
```

Change the left `<aside>` to:

```tsx
        <aside className={`rail left ${mobileRail === 'left' ? 'open' : ''} ${railCollapsed.left ? 'collapsed' : ''}`} aria-label="Layers and controls">
          <button
            className="rail-toggle"
            aria-label={railCollapsed.left ? 'Expand left panels' : 'Collapse left panels'}
            onClick={() => toggleRail('left')}
          >
            {railCollapsed.left ? '»' : '«'}
          </button>
          {!railCollapsed.left && (<>
            <button className="sheet-close" aria-label="Close panels" onClick={() => setMobileRail(null)}>✕</button>
            <LayerManager />
            ... (all existing children unchanged) ...
          </>)}
        </aside>
```

`InspectorRail` renders its own `<aside class="rail right">` — pass collapse through the store inside `InspectorRail.tsx`: read `railCollapsed.right` + `toggleRail`, render the same `rail-toggle` button (labels 'Collapse inspector'/'Expand inspector', glyphs `»`/`«` mirrored) and skip its body when collapsed (add `collapsed` class).

- [ ] **Step 5: CSS**

Append to `src/index.css`:

```css
.rail-toggle {
  position: sticky; top: 0; z-index: 2; align-self: flex-end;
  background: var(--panel, #10161c); color: var(--fg, #cfe3d8);
  border: 1px solid var(--line); border-radius: 4px;
  font-size: 12px; line-height: 1; padding: 4px 6px; cursor: pointer;
}
.rail.collapsed { width: 28px; min-width: 28px; padding: 4px 2px; overflow: hidden; }
.shell-body:has(.rail.left.collapsed) { grid-template-columns: 28px 1fr 320px; }
.shell-body:has(.rail.right.collapsed) { grid-template-columns: 260px 1fr 28px; }
.shell-body:has(.rail.left.collapsed):has(.rail.right.collapsed) { grid-template-columns: 28px 1fr 28px; }
@media (max-width: 860px) {
  .rail-toggle { display: none; }
  .rail.collapsed { width: auto; min-width: 0; }
}
```

- [ ] **Step 6: Command palette entries**

In `CommandPalette.tsx` `base` array add:

```ts
      { id: 'toggle-left-rail', label: 'Toggle left panels', hint: 'view', run: () => useStore.getState().toggleRail('left') },
      { id: 'toggle-inspector', label: 'Toggle inspector', hint: 'view', run: () => useStore.getState().toggleRail('right') },
```

(import nothing new — `useStore` already imported).

- [ ] **Step 7: Verify + commit**

Run: `npm run typecheck` (exit 0), rebuild + `npx playwright test -g "side rails collapse"` (PASS).

```bash
git add src/state/store.ts src/App.tsx src/components/InspectorRail.tsx src/components/CommandPalette.tsx src/index.css tests/smoke.spec.ts
git commit -m "Feat: show/hide side rails (persisted, palette commands)"
```

---

### Task 3: Country alert-level highlighting

**Files:**
- Create: `src/lib/alertLevels.ts`
- Create: `public/data/conflict_zones.json`
- Modify: `src/state/store.ts` (showAlertLevels + conflictZones)
- Modify: `src/components/MapCanvas.tsx` (fill layer)
- Modify: `src/components/LayerManager.tsx` (toggle + legend)
- Test: `tests/smoke.spec.ts`

**Interfaces:**
- Consumes: `computeCountryRisk(events): CountryRisk[]` from `src/lib/risk.ts` (keys are GDACS country *names*); countries GeoJSON property `NAME` (`src/lib/countries.ts` CountryProps).
- Produces: `type AlertLevel = 'conflict' | 'high' | 'elevated' | 'monitoring'`; `countryAlertLevels(events: GeoEvent[], conflictZones: string[]): Map<string, AlertLevel>` (key = country NAME); `ALERT_COLORS: Record<AlertLevel, string>`; `ALERT_LABELS: Record<AlertLevel, string>`; store `showAlertLevels: boolean`, `setShowAlertLevels(on: boolean)`, `conflictZones: string[] | null`, `loadConflictZones(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Append to `tests/smoke.spec.ts`:

```ts
test('country alert-levels toggle with legend', async ({ page }) => {
  await page.goto('/');
  const checkbox = page.getByRole('checkbox', { name: /Country alert levels/i });
  await expect(checkbox).toBeVisible();
  await expect(checkbox).toBeChecked();
  await expect(page.getByText('High alert', { exact: true })).toBeVisible();
  await expect(page.getByText('Conflict zone', { exact: true })).toBeVisible();
});
```

- [ ] **Step 2: Run to verify it fails** — `npx playwright test -g "country alert-levels"` → FAIL (checkbox not found).

- [ ] **Step 3: Static conflict-zone dataset**

Create `public/data/conflict_zones.json` (names must match Natural Earth `NAME`):

```json
{
  "source": "UCDP Georeferenced Event Dataset — countries with active state-based armed conflict (public summary)",
  "homepage": "https://ucdp.uu.se/",
  "retrieved": "2026-07-09",
  "note": "Static curated list; refreshed manually. Advisory only.",
  "countries": ["Ukraine", "Russia", "Israel", "Lebanon", "Syria", "Yemen", "Sudan", "Myanmar", "Dem. Rep. Congo", "Somalia", "Mali", "Burkina Faso", "Ethiopia", "Haiti"]
}
```

Verify each name exists in the vendored dataset before committing:
`node -e "const c=require('./public/data/ne_countries_50m.json').features.map(f=>f.properties.NAME); for (const n of require('./public/data/conflict_zones.json').countries) if(!c.includes(n)) console.log('MISSING', n)"`
Expected: no output. Fix any MISSING names to the dataset's spelling.

- [ ] **Step 4: Pure module**

Create `src/lib/alertLevels.ts`:

```ts
import type { GeoEvent } from './providers/types';
import { computeCountryRisk } from './risk';

/** Derived country alert level. 'conflict' comes from the static
 *  conflict_zones.json (source-labeled); the rest derive from live GDACS
 *  weights via computeCountryRisk. Advisory, never a forecast. */
export type AlertLevel = 'conflict' | 'high' | 'elevated' | 'monitoring';

export const ALERT_COLORS: Record<AlertLevel, string> = {
  conflict: '#b3123d',
  high: '#ff5a52',
  elevated: '#ffb454',
  monitoring: '#ffe066',
};

export const ALERT_LABELS: Record<AlertLevel, string> = {
  conflict: 'Conflict zone',
  high: 'High alert',
  elevated: 'Elevated',
  monitoring: 'Monitoring',
};

/** score >= 6 high, >= 3 elevated, >= 1 monitoring; conflict list overrides. */
export function countryAlertLevels(events: GeoEvent[], conflictZones: string[]): Map<string, AlertLevel> {
  const out = new Map<string, AlertLevel>();
  for (const r of computeCountryRisk(events)) {
    out.set(r.country, r.score >= 6 ? 'high' : r.score >= 3 ? 'elevated' : 'monitoring');
  }
  for (const name of conflictZones) out.set(name, 'conflict');
  return out;
}
```

- [ ] **Step 5: Store additions**

`src/state/store.ts` — interface:

```ts
  /** derived country alert-level fill (user toggle, persisted) */
  showAlertLevels: boolean;
  /** static conflict-zone country names; loaded once, never persisted */
  conflictZones: string[] | null;
  setShowAlertLevels: (on: boolean) => void;
  loadConflictZones: () => Promise<void>;
```

Initializer: `showAlertLevels: true,` and `conflictZones: null,`. Actions:

```ts
      setShowAlertLevels: (on) => set({ showAlertLevels: on }),

      loadConflictZones: async () => {
        if (get().conflictZones) return;
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}data/conflict_zones.json`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const j = (await res.json()) as { countries: string[] };
          set({ conflictZones: j.countries });
        } catch {
          set({ conflictZones: [] }); // no fill rather than a stale/wrong fill
        }
      },
```

Persist: `showAlertLevels: s.showAlertLevels,` in partialize; `showAlertLevels?: boolean;` in merge type; `showAlertLevels: p.showAlertLevels ?? current.showAlertLevels,` in merge return. In `App.tsx`'s initial-load effect add `void useStore.getState().loadConflictZones();`.

- [ ] **Step 6: Map fill layer**

In `MapCanvas.tsx`, right after the existing transparent `countries-fill` layer is added (line ~209), add:

```ts
    map.addLayer(
      { id: 'alert-fill', type: 'fill', source: 'countries', paint: { 'fill-opacity': 0.25, 'fill-color': 'rgba(0,0,0,0)' } },
      'countries-fill',
    );
```

Add a data-driven paint effect (new `useEffect` alongside the existing event-data effect; import `countryAlertLevels` and `ALERT_COLORS` from `../lib/alertLevels`):

```tsx
  const showAlertLevels = useStore((s) => s.showAlertLevels);
  const conflictZones = useStore((s) => s.conflictZones);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('alert-fill')) return;
    if (!showAlertLevels || !conflictZones) {
      map.setLayoutProperty('alert-fill', 'visibility', 'none');
      return;
    }
    map.setLayoutProperty('alert-fill', 'visibility', 'visible');
    const levels = countryAlertLevels(events, conflictZones);
    const expr: unknown[] = ['match', ['get', 'NAME']];
    for (const [name, level] of levels) expr.push(name, ALERT_COLORS[level]);
    expr.push('rgba(0,0,0,0)');
    map.setPaintProperty('alert-fill', 'fill-color', expr as never);
  }, [events, showAlertLevels, conflictZones]);
```

(Adapt `mapRef`/`events` names to the file's actual local names — the file already has both for the events source effect. Note MapLibre `match` needs at least one branch: if `levels.size === 0`, set `'fill-color'` to `'rgba(0,0,0,0)'` directly instead of the match expression.)

- [ ] **Step 7: LayerManager toggle + legend**

In `LayerManager.tsx`, after the existing layer groups render, add a derived-layer block (match surrounding markup/classes used for layer rows):

```tsx
      <label className="layer-row">
        <input
          type="checkbox"
          checked={showAlertLevels}
          onChange={(e) => setShowAlertLevels(e.target.checked)}
          aria-label="Country alert levels"
        />
        <span>Country alert levels</span>
        <span className="tag">DERIVED</span>
      </label>
      {showAlertLevels && (
        <div className="alert-legend">
          {(Object.keys(ALERT_LABELS) as AlertLevel[]).map((l) => (
            <span key={l} className="alert-legend-item">
              <i style={{ background: ALERT_COLORS[l] }} /> {ALERT_LABELS[l]}
            </span>
          ))}
        </div>
      )}
```

with selectors `const showAlertLevels = useStore((s) => s.showAlertLevels); const setShowAlertLevels = useStore((s) => s.setShowAlertLevels);` and imports from `../lib/alertLevels`. CSS append:

```css
.alert-legend { display: flex; flex-wrap: wrap; gap: 6px 10px; padding: 4px 8px; font-size: 11px; }
.alert-legend-item i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
```

- [ ] **Step 8: Verify + commit**

`npm run typecheck` → 0; rebuild + `npx playwright test -g "country alert-levels"` → PASS.

```bash
git add src/lib/alertLevels.ts public/data/conflict_zones.json src/state/store.ts src/components/MapCanvas.tsx src/components/LayerManager.tsx src/App.tsx src/index.css tests/smoke.spec.ts
git commit -m "Feat: derived country alert-level highlighting with legend + static conflict zones"
```

---

### Task 4: DEFCON-style derived alert chip

**Files:**
- Modify: `src/lib/signals.ts` (computeAlertIndex)
- Modify: `src/components/StatusBar.tsx` (chip)
- Modify: `src/index.css`
- Test: `tests/smoke.spec.ts`

**Interfaces:**
- Consumes: `computeSignals(events)` (same file), GDACS events (`e.type === 'disaster-alert'`, `e.props.alertLevel` 'Red'|'Orange'|'Green'), quake `e.magnitude`.
- Produces: `computeAlertIndex(events: GeoEvent[]): { level: 1 | 2 | 3 | 4 | 5; reasons: string[] }`.

- [ ] **Step 1: Write the failing test**

```ts
test('derived DEFCON-style chip shows in the status bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('alert-chip')).toBeVisible();
  await expect(page.getByTestId('alert-chip')).toContainText(/DEFCON [1-5]/);
  await expect(page.getByTestId('alert-chip')).toContainText('DERIVED');
});
```

- [ ] **Step 2: Run** — `npx playwright test -g "DEFCON-style chip"` → FAIL.

- [ ] **Step 3: Implement computeAlertIndex**

Append to `src/lib/signals.ts`:

```ts
/** DEFCON-style composite alert index, derived transparently from the live
 *  public feeds. NOT the official U.S. DEFCON (which is not public) — the UI
 *  must always badge this DERIVED · UNOFFICIAL. Level 5 = quiet baseline,
 *  1 = extreme. Thresholds are documented inline and every trigger is
 *  itemized in `reasons`. */
export function computeAlertIndex(events: GeoEvent[]): { level: 1 | 2 | 3 | 4 | 5; reasons: string[] } {
  const gdacs = events.filter((e) => e.type === 'disaster-alert');
  const red = gdacs.filter((e) => e.props.alertLevel === 'Red').length;
  const orange = gdacs.filter((e) => e.props.alertLevel === 'Orange').length;
  const maxMag = Math.max(0, ...events.filter((e) => e.type === 'earthquake').map((e) => e.magnitude ?? 0));
  const signalCount = computeSignals(events).length;

  const reasons: string[] = [];
  if (red) reasons.push(`${red} GDACS Red alert${red > 1 ? 's' : ''}`);
  if (orange) reasons.push(`${orange} GDACS Orange alert${orange > 1 ? 's' : ''}`);
  if (maxMag >= 6) reasons.push(`M${maxMag.toFixed(1)} earthquake in window`);
  if (signalCount >= 3) reasons.push(`${signalCount} co-location signals`);

  let level: 1 | 2 | 3 | 4 | 5 = 5;
  if (red >= 5) level = 1;
  else if (red >= 3) level = 2;
  else if (red >= 1 || maxMag >= 7) level = 3;
  else if (orange >= 1 || maxMag >= 6 || signalCount >= 3) level = 4;
  if (reasons.length === 0) reasons.push('No elevated public-feed indicators');
  return { level, reasons };
}
```

- [ ] **Step 4: StatusBar chip**

In `StatusBar.tsx` import `computeAlertIndex` from `../lib/signals`, add:

```tsx
  const events = useStore((s) => s.events);
  const alert = computeAlertIndex(events);
```

Render after the mode pill:

```tsx
      <span
        data-testid="alert-chip"
        className={`alert-chip lvl-${alert.level}`}
        title={`Derived from public feeds — not the official DEFCON.\n${alert.reasons.join('\n')}`}
      >
        DEFCON {alert.level} <small>DERIVED · UNOFFICIAL</small>
      </span>
```

CSS append:

```css
.alert-chip { font: 600 12px/1 inherit; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--line); letter-spacing: 0.04em; white-space: nowrap; }
.alert-chip small { opacity: 0.65; font-size: 9px; margin-left: 4px; }
.alert-chip.lvl-5 { color: #45e0b0; } .alert-chip.lvl-4 { color: #ffe066; }
.alert-chip.lvl-3 { color: #ffb454; } .alert-chip.lvl-2 { color: #ff7a3c; }
.alert-chip.lvl-1 { color: #ff5a52; }
@media (max-width: 860px) { .alert-chip small { display: none; } }
```

- [ ] **Step 5: Verify + commit**

`npm run typecheck` → 0; rebuild + `npx playwright test -g "DEFCON-style chip"` → PASS.

```bash
git add src/lib/signals.ts src/components/StatusBar.tsx src/index.css tests/smoke.spec.ts
git commit -m "Feat: derived DEFCON-style alert chip (badged DERIVED, itemized reasons)"
```

---

### Task 5: Dock data providers (GDELT news + CoinGecko top coins)

**Files:**
- Create: `src/lib/providers/gdelt.ts`
- Modify: `src/lib/providers/markets.ts` (fetchTopCoins)
- Modify: `src/state/store.ts` (dock fetch state + refreshDock + gdelt provider health)
- Modify: `src/App.tsx` (refreshDock on load + interval)
- Test: typecheck only (UI test lands with Task 6).

**Interfaces:**
- Produces:
  - `interface NewsArticle { title: string; url: string; domain: string; seendate: string }`
  - `fetchGdeltNews(query: string, signal?: AbortSignal): Promise<{ articles: NewsArticle[]; mode: DataMode; latencyMs: number; error: string | null }>`
  - `GDELT_META = { id: 'gdelt', name: 'GDELT news', license: 'GDELT open data', homepage: 'https://www.gdeltproject.org/' }`
  - `REGION_QUERIES: Record<string, string>` (keys: `World`, `United States`, `Europe`, `Middle East`, `Africa`, `Latin America`, `Asia-Pacific`)
  - `interface CoinRow { id: string; symbol: string; price: number; change24h: number | null }`; `fetchTopCoins(signal?: AbortSignal): Promise<{ coins: CoinRow[]; mode: DataMode; latencyMs: number; error: string | null }>` in markets.ts
  - store: `dockNews: { region: string; articles: NewsArticle[]; mode: DataMode; error: string | null }`, `dockCrypto: { coins: CoinRow[]; mode: DataMode; error: string | null }`, `setDockRegion(region: string): void`, `refreshDock(): Promise<void>`

- [ ] **Step 1: GDELT provider**

Create `src/lib/providers/gdelt.ts`:

```ts
import type { DataMode } from './types';

// GDELT DOC 2.0 — keyless, CORS-open JSON article search over global news.
// https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
const BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';

export const GDELT_META = {
  id: 'gdelt',
  name: 'GDELT news',
  license: 'GDELT open data',
  homepage: 'https://www.gdeltproject.org/',
};

export interface NewsArticle {
  title: string;
  url: string;
  domain: string;
  /** GDELT seendate, e.g. "20260709T123000Z" */
  seendate: string;
}

/** Region tab → GDELT query. Keyword queries are tunable; each is scoped to
 *  English-language sources. */
export const REGION_QUERIES: Record<string, string> = {
  'World': '(domain:reuters.com OR domain:apnews.com OR domain:bbc.com OR domain:france24.com)',
  'United States': '("united states" OR washington OR congress OR "white house")',
  'Europe': '(europe OR "european union" OR brussels OR ukraine)',
  'Middle East': '("middle east" OR israel OR iran OR gaza OR "saudi arabia")',
  'Africa': '(africa OR nigeria OR sahel OR ethiopia OR sudan)',
  'Latin America': '("latin america" OR brazil OR mexico OR argentina OR venezuela)',
  'Asia-Pacific': '(china OR japan OR taiwan OR korea OR indonesia OR australia)',
};

/** Clearly-labelled MOCK sample for offline fallback (mode: 'mock'). */
const MOCK: NewsArticle[] = [
  { title: '[SAMPLE] Global markets steady as central banks hold rates', url: 'https://example.org/1', domain: 'sample data (offline)', seendate: '20260709T000000Z' },
  { title: '[SAMPLE] Regional summit concludes with joint statement', url: 'https://example.org/2', domain: 'sample data (offline)', seendate: '20260709T000000Z' },
];

interface GdeltJson { articles?: { title: string; url: string; domain: string; seendate: string }[] }

export async function fetchGdeltNews(query: string, signal?: AbortSignal): Promise<{ articles: NewsArticle[]; mode: DataMode; latencyMs: number; error: string | null }> {
  const started = performance.now();
  try {
    const q = `${query} sourcelang:eng`;
    const url = `${BASE}?query=${encodeURIComponent(q)}&mode=ArtList&format=json&maxrecords=15&timespan=1d`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as GdeltJson;
    const articles = (j.articles ?? []).map((a) => ({ title: a.title, url: a.url, domain: a.domain, seendate: a.seendate }));
    const latencyMs = Math.round(performance.now() - started);
    if (articles.length === 0) return { articles: MOCK, mode: 'mock', latencyMs, error: 'no results' };
    return { articles, mode: 'live', latencyMs, error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { articles: MOCK, mode: 'mock', latencyMs: Math.round(performance.now() - started), error: err instanceof Error ? err.message : 'fetch failed' };
  }
}
```

- [ ] **Step 2: CoinGecko top coins**

Append to `src/lib/providers/markets.ts`:

```ts
export interface CoinRow {
  id: string;
  symbol: string;
  price: number;
  change24h: number | null;
}

const TOP_COINS_FEED = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=8&page=1&price_change_percentage=24h';

/** Clearly-labelled MOCK sample for offline fallback (mode: 'mock'). */
const COINS_MOCK: CoinRow[] = [
  { id: 'bitcoin', symbol: 'BTC', price: 60000, change24h: 0 },
  { id: 'ethereum', symbol: 'ETH', price: 3000, change24h: 0 },
];

interface CoinJson { id: string; symbol: string; current_price: number; price_change_percentage_24h: number | null }

export async function fetchTopCoins(signal?: AbortSignal): Promise<{ coins: CoinRow[]; mode: DataMode; latencyMs: number; error: string | null }> {
  const started = performance.now();
  try {
    const rows = await getJson<CoinJson[]>(TOP_COINS_FEED, signal);
    const coins = rows.map((r) => ({ id: r.id, symbol: r.symbol.toUpperCase(), price: r.current_price, change24h: r.price_change_percentage_24h }));
    const latencyMs = Math.round(performance.now() - started);
    if (coins.length === 0) return { coins: COINS_MOCK, mode: 'mock', latencyMs, error: 'empty response' };
    return { coins, mode: 'live', latencyMs, error: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { coins: COINS_MOCK, mode: 'mock', latencyMs: Math.round(performance.now() - started), error: err instanceof Error ? err.message : 'fetch failed' };
  }
}
```

- [ ] **Step 3: Store wiring**

`src/state/store.ts` — imports:

```ts
import { fetchGdeltNews, GDELT_META, REGION_QUERIES, type NewsArticle } from '../lib/providers/gdelt';
import { fetchTopCoins, type CoinRow } from '../lib/providers/markets'; // extend the existing markets import
```

Interface additions:

```ts
  /** bottom-dock news/crypto snapshots; modes are real, never faked */
  dockNews: { region: string; articles: NewsArticle[]; mode: DataMode; error: string | null };
  dockCrypto: { coins: CoinRow[]; mode: DataMode; error: string | null };
  setDockRegion: (region: string) => void;
  refreshDock: () => Promise<void>;
```

Initializer additions:

```ts
      dockNews: { region: 'World', articles: [], mode: 'loading', error: null },
      dockCrypto: { coins: [], mode: 'loading', error: null },
```

Provider health: add `gdelt: providerStub(GDELT_META),` to the `providers` record and `gdelt: true` to `sources`. **Do not** add gdelt to `FETCHERS` (it returns articles, not GeoEvents).

Actions:

```ts
      setDockRegion: (region) => {
        set((s) => ({ dockNews: { ...s.dockNews, region, mode: 'loading' } }));
        void get().refreshDock();
      },

      refreshDock: async () => {
        const region = get().dockNews.region;
        const query = REGION_QUERIES[region] ?? REGION_QUERIES['World'];
        const [news, coins] = await Promise.all([fetchGdeltNews(query), fetchTopCoins()]);
        set((s) => ({
          dockNews: { region: s.dockNews.region, articles: news.articles, mode: news.mode, error: news.error },
          dockCrypto: { coins: coins.coins, mode: coins.mode, error: coins.error },
          providers: {
            ...s.providers,
            gdelt: { ...s.providers.gdelt, status: news.mode === 'live' ? 'ok' : 'degraded', lastSuccessAt: news.mode === 'live' ? Date.now() : s.providers.gdelt.lastSuccessAt, latencyMs: news.latencyMs, itemCount: news.articles.length, error: news.error },
          },
        }));
      },
```

(Check `ProviderHealth.status` union in `src/lib/providers/types.ts` — use its actual member names; the pattern above mirrors how `refreshAll` sets health.) In `App.tsx` initial-load effect add `void useStore.getState().refreshDock();` and include the dock in the 5-minute interval by replacing the `setInterval(refreshAll, ...)` callback with `() => { void refreshAll(); void useStore.getState().refreshDock(); }`.

- [ ] **Step 4: Verify + commit**

`npm run typecheck` → 0. `npm run build` → green.

```bash
git add src/lib/providers/gdelt.ts src/lib/providers/markets.ts src/state/store.ts src/App.tsx
git commit -m "Feat: GDELT news + CoinGecko top-coins providers with dock store state"
```

---

### Task 6: Bottom dock UI (5 mini-panels)

**Files:**
- Create: `src/components/BottomDock.tsx`
- Create: `src/components/dock/DockPanel.tsx`
- Create: `src/components/dock/WorldNews.tsx`
- Create: `src/components/dock/RegionalNews.tsx`
- Create: `src/components/dock/YouTubeNews.tsx`
- Create: `src/components/dock/MarketsMini.tsx`
- Create: `src/components/dock/CryptoMini.tsx`
- Modify: `src/App.tsx`, `src/state/store.ts` (dockOpen), `src/index.css`, `src/components/PrivacyPanel.tsx` (YouTube note)
- Test: `tests/smoke.spec.ts`

**Interfaces:**
- Consumes: `dockNews`, `dockCrypto`, `setDockRegion`, `market` (existing MarketQuote state), `REGION_QUERIES` keys.
- Produces: store `dockOpen: boolean` (persisted) + `toggleDock(): void`; `<DockPanel title mode source>` wrapper.
- Region-state note: `dockNews` is ONE shared fetch state. RegionalNews owns the region tabs. WorldNews renders `dockNews` articles when `region === 'World'` (the default), else a one-line note "Regional tab active — see REGIONAL NEWS". The two panels never fight over the shared state.

- [ ] **Step 1: Write the failing test**

```ts
test('bottom dock renders news, markets, crypto and youtube panels', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('bottom-dock')).toBeVisible();
  await expect(page.getByText('WORLD NEWS')).toBeVisible();
  await expect(page.getByText('REGIONAL NEWS')).toBeVisible();
  await expect(page.getByText('LIVE TV')).toBeVisible();
  await expect(page.getByText('CRYPTO')).toBeVisible();
  // news rows or DEMO badge — either satisfies the "honest data" contract
  const dock = page.getByTestId('bottom-dock');
  await expect(dock.locator('.dock-row, .demo-badge').first()).toBeVisible({ timeout: 15000 });
  // youtube loads only on explicit click
  await expect(page.getByText(/click a channel to load/i)).toBeVisible();
  // collapse
  await page.getByRole('button', { name: 'Collapse dock' }).click();
  await expect(page.getByText('WORLD NEWS')).not.toBeVisible();
});
```

- [ ] **Step 2: Run** — FAIL (`bottom-dock` testid absent).

- [ ] **Step 3: Store dockOpen**

Interface: `dockOpen: boolean;` + `toggleDock: () => void;`. Initializer `dockOpen: true,`. Action `toggleDock: () => set((s) => ({ dockOpen: !s.dockOpen })),`. Partialize `dockOpen: s.dockOpen,`; merge type `dockOpen?: boolean;`; merge return `dockOpen: p.dockOpen ?? current.dockOpen,`.

- [ ] **Step 4: DockPanel wrapper**

`src/components/dock/DockPanel.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { DataMode } from '../../lib/providers/types';

export default function DockPanel({ title, mode, source, children }: {
  title: string; mode?: DataMode; source?: string; children: ReactNode;
}) {
  return (
    <section className="dock-panel" aria-label={title}>
      <header className="dock-panel-head">
        <span className="dock-panel-title">{title}</span>
        {mode === 'mock' && <span className="demo-badge">DEMO</span>}
        {mode === 'live' && <span className="live-badge">LIVE</span>}
        {source && <span className="dock-source" title={source}>{source}</span>}
      </header>
      <div className="dock-panel-body">{children}</div>
    </section>
  );
}
```

- [ ] **Step 5: News panels**

`src/components/dock/WorldNews.tsx`:

```tsx
import { useStore } from '../../state/store';
import DockPanel from './DockPanel';

function ago(seendate: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(seendate);
  if (!m) return '';
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  return min < 60 ? `${min}m` : `${Math.round(min / 60)}h`;
}

export default function WorldNews() {
  const { region, articles, mode, error } = useStore((s) => s.dockNews);
  return (
    <DockPanel title="WORLD NEWS" mode={region === 'World' ? mode : undefined} source="GDELT">
      {region !== 'World' ? (
        <div className="dock-note">Regional tab active — see REGIONAL NEWS.</div>
      ) : (
        <>
          {error && mode === 'mock' && <div className="dock-err">feed unavailable — sample shown</div>}
          {articles.slice(0, 8).map((a) => (
            <a key={a.url} className="dock-row" href={a.url} target="_blank" rel="noreferrer">
              <span className="dock-row-title">{a.title}</span>
              <small>{a.domain} · {ago(a.seendate)}</small>
            </a>
          ))}
        </>
      )}
    </DockPanel>
  );
}
```

`src/components/dock/RegionalNews.tsx`:

```tsx
import { useStore } from '../../state/store';
import { REGION_QUERIES } from '../../lib/providers/gdelt';
import DockPanel from './DockPanel';

export default function RegionalNews() {
  const { region, articles, mode } = useStore((s) => s.dockNews);
  const setDockRegion = useStore((s) => s.setDockRegion);
  const regions = Object.keys(REGION_QUERIES);
  return (
    <DockPanel title="REGIONAL NEWS" mode={mode} source="GDELT">
      <div className="dock-tabs" role="tablist" aria-label="News region">
        {regions.map((r) => (
          <button key={r} role="tab" aria-selected={region === r} className={`dock-tab ${region === r ? 'active' : ''}`} onClick={() => setDockRegion(r)}>
            {r}
          </button>
        ))}
      </div>
      {articles.slice(0, 6).map((a) => (
        <a key={a.url} className="dock-row" href={a.url} target="_blank" rel="noreferrer">
          <span className="dock-row-title">{a.title}</span>
          <small>{a.domain}</small>
        </a>
      ))}
    </DockPanel>
  );
}
```

- [ ] **Step 6: YouTube panel (click-to-load)**

`src/components/dock/YouTubeNews.tsx`:

```tsx
import { useState } from 'react';
import DockPanel from './DockPanel';

/** 24/7 live news channels; embeds load ONLY after an explicit click so no
 *  third-party request happens silently (see PrivacyPanel note). Channel IDs
 *  verified against each broadcaster's official YouTube channel. */
const CHANNELS: { name: string; channelId: string }[] = [
  { name: 'Sky News', channelId: 'UCoMdktPbSTixAyNGwb-UYkQ' },
  { name: 'Al Jazeera', channelId: 'UCNye-wNBqNL5ZzHSJj3l8Bg' },
  { name: 'DW News', channelId: 'UCknLrEdhRCp1aegoMqRaCZg' },
  { name: 'France 24', channelId: 'UCQfwfsi5VrQ8yKZ-UWmAEFg' },
  { name: 'ABC News', channelId: 'UCBi2mrWuNuyYy4gbM6fU18Q' },
];

export default function YouTubeNews() {
  const [active, setActive] = useState<string | null>(null);
  const chan = CHANNELS.find((c) => c.channelId === active);
  return (
    <DockPanel title="LIVE TV" source="YouTube">
      <div className="dock-tabs">
        {CHANNELS.map((c) => (
          <button key={c.channelId} className={`dock-tab ${active === c.channelId ? 'active' : ''}`} onClick={() => setActive(c.channelId)}>
            {c.name}
          </button>
        ))}
      </div>
      {chan ? (
        <iframe
          className="dock-video"
          src={`https://www.youtube-nocookie.com/embed/live_stream?channel=${chan.channelId}&autoplay=1&mute=1`}
          title={`${chan.name} live stream`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <div className="dock-placeholder">Click a channel to load — loads YouTube content (third-party).</div>
      )}
    </DockPanel>
  );
}
```

Add to `PrivacyPanel.tsx` copy block: `LIVE TV embeds load YouTube (Google) content only after you click a channel — nothing loads silently.`

- [ ] **Step 7: Markets + Crypto minis**

`src/components/dock/MarketsMini.tsx` (reuses existing store `market` — FX live; indices intentionally absent until a keyless/BYO source exists — never fake):

```tsx
import { useStore } from '../../state/store';
import DockPanel from './DockPanel';

export default function MarketsMini() {
  const { quotes, mode } = useStore((s) => s.market);
  const fx = quotes.filter((q) => q.id.startsWith('fx-'));
  return (
    <DockPanel title="MARKETS" mode={mode} source="ECB via Frankfurter">
      {fx.map((q) => (
        <div key={q.id} className="dock-row">
          <span className="dock-row-title">{q.label}</span>
          <b>{q.value}</b>
          {q.asOf && <small>{q.asOf}</small>}
        </div>
      ))}
      <div className="dock-note">Indices need a keyed source — not shown rather than faked.</div>
    </DockPanel>
  );
}
```

`src/components/dock/CryptoMini.tsx`:

```tsx
import { useStore } from '../../state/store';
import DockPanel from './DockPanel';

export default function CryptoMini() {
  const { coins, mode } = useStore((s) => s.dockCrypto);
  return (
    <DockPanel title="CRYPTO" mode={mode} source="CoinGecko">
      {coins.map((c) => (
        <div key={c.id} className="dock-row">
          <span className="dock-row-title">{c.symbol}</span>
          <b>${c.price.toLocaleString('en-US', { maximumFractionDigits: c.price >= 100 ? 0 : 2 })}</b>
          {c.change24h != null && (
            <small className={c.change24h >= 0 ? 'up' : 'down'}>{c.change24h >= 0 ? '+' : ''}{c.change24h.toFixed(1)}%</small>
          )}
        </div>
      ))}
    </DockPanel>
  );
}
```

- [ ] **Step 8: BottomDock + App wiring + CSS**

`src/components/BottomDock.tsx`:

```tsx
import { useStore } from '../state/store';
import WorldNews from './dock/WorldNews';
import RegionalNews from './dock/RegionalNews';
import YouTubeNews from './dock/YouTubeNews';
import MarketsMini from './dock/MarketsMini';
import CryptoMini from './dock/CryptoMini';

export default function BottomDock() {
  const open = useStore((s) => s.dockOpen);
  const toggleDock = useStore((s) => s.toggleDock);
  return (
    <div className={`bottom-dock ${open ? 'open' : ''}`} data-testid="bottom-dock">
      <header className="dock-bar">
        <span className="dock-bar-title">INTEL DOCK</span>
        <button className="kbd" aria-label={open ? 'Collapse dock' : 'Expand dock'} onClick={toggleDock}>
          {open ? '▾' : '▴'}
        </button>
      </header>
      {open && (
        <div className="dock-strip">
          <WorldNews />
          <RegionalNews />
          <YouTubeNews />
          <MarketsMini />
          <CryptoMini />
        </div>
      )}
    </div>
  );
}
```

In `App.tsx`: `import BottomDock from './components/BottomDock';` and render `<BottomDock />` between `</div>` (shell-body close) and `<ProviderHealthBar />`. Change `.shell` rows in `index.css` from `auto 1fr auto` to `auto 1fr auto auto`.

CSS append:

```css
.bottom-dock { border-top: 1px solid var(--line); background: var(--panel, #0c1116); }
.dock-bar { display: flex; align-items: center; justify-content: space-between; padding: 2px 10px; }
.dock-bar-title { font-size: 11px; letter-spacing: 0.12em; opacity: 0.8; }
.dock-strip { display: flex; gap: 10px; overflow-x: auto; padding: 6px 10px 10px; }
.dock-panel { flex: 0 0 300px; max-height: 210px; overflow-y: auto; border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; display: flex; flex-direction: column; gap: 4px; }
.dock-panel-head { display: flex; align-items: center; gap: 6px; position: sticky; top: 0; background: inherit; }
.dock-panel-title { font-size: 11px; letter-spacing: 0.1em; font-weight: 600; }
.demo-badge { font-size: 9px; color: #ffb454; border: 1px solid #ffb454; border-radius: 3px; padding: 1px 4px; }
.live-badge { font-size: 9px; color: #45e0b0; border: 1px solid #45e0b0; border-radius: 3px; padding: 1px 4px; }
.dock-source { font-size: 9px; opacity: 0.55; margin-left: auto; }
.dock-row { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; font-size: 12px; text-decoration: none; color: inherit; padding: 2px 0; border-bottom: 1px dotted var(--line); }
.dock-row-title { flex: 1 1 100%; }
.dock-row small { opacity: 0.6; font-size: 10px; }
.dock-row small.up { color: #45e0b0; } .dock-row small.down { color: #ff5a52; }
.dock-tabs { display: flex; flex-wrap: wrap; gap: 4px; padding-bottom: 4px; }
.dock-tab { font-size: 10px; padding: 2px 6px; border: 1px solid var(--line); border-radius: 3px; background: none; color: inherit; cursor: pointer; }
.dock-tab.active { border-color: #45e0b0; color: #45e0b0; }
.dock-video { width: 100%; aspect-ratio: 16 / 9; border: 0; border-radius: 4px; }
.dock-placeholder, .dock-note, .dock-err { font-size: 11px; opacity: 0.65; padding: 6px 0; }
@media (max-width: 860px) { .dock-panel { flex-basis: 260px; } }
```

- [ ] **Step 9: Verify + commit**

`npm run typecheck` → 0; rebuild + `npx playwright test -g "bottom dock"` → PASS. Also re-run `-g "side rails collapse"` (layout changed).

```bash
git add src/components/BottomDock.tsx src/components/dock src/components/PrivacyPanel.tsx src/App.tsx src/state/store.ts src/index.css tests/smoke.spec.ts
git commit -m "Feat: bottom intel dock — world/regional news (GDELT), click-to-load live TV, FX, crypto"
```

---

### Task 7: Full verification + docs

**Files:**
- Modify: `docs/GAP_MATRIX.md`, `docs/SESSION_NOTES.md`
- Test: full suite

- [ ] **Step 1: Full suite**

Run: `npm run build` (green), `npx vite preview --port 4173 &`, `npx playwright test` — Expected: all tests PASS including the four new ones. Fix regressions before proceeding (the first test's console-error allowlist may need `youtube|googlevideo` added — only if actually observed).

- [ ] **Step 2: Docs**

- `docs/GAP_MATRIX.md`: add rows — Country alert levels (Done · derived), DEFCON-style chip (Done · derived/unofficial), Bottom dock news/TV/FX/crypto (Done · GDELT/YouTube/ECB/CoinGecko), Stock indices (Deferred · needs keyed source), rail show/hide (Done).
- `docs/SESSION_NOTES.md`: append a dated entry — Phase 1 shipped on `feature/phase1-dashboard`; Phase 2 = 37-layer triage; Phase 3 = remaining panels; spec + plan paths.

- [ ] **Step 3: Commit**

```bash
git add docs/GAP_MATRIX.md docs/SESSION_NOTES.md
git commit -m "Docs: record Phase 1 (pin, rails, alert levels, DEFCON chip, intel dock)"
```

- [ ] **Step 4: Manual visual QA note for the user**

`npm run dev` → check: F-22 pin (enable locate-me), rail chevrons, colored countries + legend, DEFCON chip tooltip, dock panels + a YouTube channel click.
