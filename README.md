# TERRA-WATCH — Orbital Recon HUD

A single-page, static **3D Earth command-center** website with a modern, clean
US-military HUD aesthetic. It plots your **current location** on an interactive
globe and shows live position telemetry and a heading compass.

No build step. No backend. Pure HTML/CSS/JS + [Three.js](https://threejs.org/)
loaded from a CDN — drop it on GitHub Pages and it runs.

## Features

- **3D globe** (Three.js): dark ocean sphere, lat/long graticule, country-border
  vectors, atmospheric glow, starfield, drag-to-orbit + zoom.
- **Live location marker**: pulsing rings + beacon at your GPS position; the
  camera flies to your coordinate on fix.
- **Right sidebar — Position Telemetry**: latitude, longitude, **altitude**,
  accuracy, speed, course, and UTM Grid Zone Designator. Decimal + DMS.
- **Left sidebar — Compass**: rotating compass rose with live device heading
  (where supported), N-up fallback otherwise.
- **Top bar** (designed for you): system marque, centered **Zulu time + DTG**
  (date-time group), and status chips — **GPS fix**, secure link, mode, and a
  session ID. Green **UNCLASSIFIED // FOR OFFICIAL USE ONLY** banner top + bottom.
- **Bottom status bar**: live message line, camera range, and FPS.

## Run locally

Geolocation and ES-module imports require an `http(s)://` origin — opening the
file directly (`file://`) will not work. Serve the folder:

```bash
# Python
python3 -m http.server 8080
# or Node
npx serve .
```

Then open <http://localhost:8080>. Your browser will prompt for location access.
If you deny it (or are on `http://` without a secure context), the HUD falls back
to a **SIMULATED** position and labels it as such.

## Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "TERRA-WATCH orbital recon HUD"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Build and deployment → Source: Deploy from
a branch → Branch: `main` / root → Save.** The site appears at
`https://<you>.github.io/<repo>/`. GitHub Pages serves over HTTPS, so geolocation
works there.

> A `.nojekyll` file is included so Pages serves all assets verbatim.

## Customize

| What | Where |
|------|-------|
| Accent color | `--accent` in `styles.css` and `ACCENT` in `app.js` |
| System name / sub-title | `.sysmark` block in `index.html` |
| Classification banner text | `.classbar` elements in `index.html` |
| Fallback (simulated) coordinate | `CFG.fallback` in `app.js` |
| Globe colors, glow, marker | `app.js` (scene section) |

## Notes

- The classification banner and military styling are **cosmetic only** — this is
  not affiliated with any government and handles no classified data.
- Country borders come from the public
  [`world-atlas`](https://github.com/topojson/world-atlas) dataset via CDN; if
  that request fails, the globe still renders with the graticule grid.
