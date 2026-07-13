# Sidereal globe spin + mobile UX pass — design

Date: 2026-07-13 · Approved direction: user chose **true sidereal speed** and asked for
mobile fixes ("docks blocking the earth", mode bar "not shown properly", Sources show/hide).

## 1. True sidereal idle spin

`MapCanvas.tsx` `SPIN_DEG_PER_SEC` changes from `1.5` to `360 / 86164` (≈ 0.004178 °/s —
one revolution per sidereal day, 23 h 56 m 4 s). The 1 s linear-ease chain, input-stops-spin
behavior, reduced-motion skip, and the `SPIN_MAX_ZOOM = 5` pause guard all stay. At this rate
the drift is honest but subtle: ~0.25°/min. That is the point — the user explicitly wants
realism over theatrics.

## 2. Sources section show/hide

`SourceManager` gets a collapsible header using the existing `groupCollapsed` store map
(persisted) under the reserved key `panel:sources` (layer groups use plain group names, so
no collision). Header reuses the `group-toggle` caret pattern from `LayerManager`.

## 3. Mode bar (2D/3D/…) on mobile

`MapModeControls` gains a `⚙` expander button, visible only ≤ 860 px. Collapsed (default)
the bar is a single button; tapping it reveals the six controls. Desktop rendering is
unchanged. Local component state — not persisted; a fresh page load starts collapsed.

## 4. Mobile dock space

- `dockOpen` initial default becomes `false` on ≤ 860 px viewports (persisted user choice
  still wins on later visits).
- Mobile dock panels shrink: `flex-basis 240px`, fixed `height 150px`.
- `ProviderHealthBar` on mobile becomes a single horizontally-scrollable row instead of
  wrapping to several lines.

## Verification

`npm run build` (tsc strict + vite), Playwright smoke suite, and manual mobile-viewport
screenshots (390×844) checking: globe visible above the folds, dock closed by default,
mode bar collapsed, Sources toggle works.
