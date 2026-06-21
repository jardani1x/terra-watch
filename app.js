import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as topojson from 'https://esm.sh/topojson-client@3';

// --- Terra-Watch dashboard modules (build-free local ESM) ---
import { load as lsLoad, save as lsSave, clearAll as lsClear } from './js/util/storage.js';
import { haversineKm, fmtKm } from './js/util/distance.js';
import { lonLatToVec3, vec3ToLonLat, toDMS, gridZone, cardinal, polysOf, polyContains, greatCirclePoints } from './js/util/geo.js';
import { fmtPrice, fmtPct, signClass } from './js/util/format.js';
import { getMarketQuotes, getQuakes, getWeather, markStale } from './js/data/feeds.js';
import { mockGeopolitical, mockRisk } from './js/data/providers/mockProvider.js';
import { searchAssets } from './js/data/providers/overpassProvider.js';
import { fetchSatellites, propagateSats } from './js/data/providers/satelliteProvider.js';
import { fetchFlights } from './js/data/providers/flightProvider.js';
import { fetchVessels, streamVessels } from './js/data/providers/vesselProvider.js';
import { createOntology, ENTITY, RELATION, MARKET_CENTERS, isMarketOpen } from './js/ontology/model.js';
import { createSelection } from './js/core/selection.js';
import { initLayers, LAYERS } from './js/ui/layers.js';
import { initCommandPalette } from './js/ui/commandPalette.js';
import { initInspector } from './js/ui/inspector.js';
import { initMarketFeed } from './js/ui/marketFeed.js';
import { initShell } from './js/ui/shell.js';
import { initNavRail } from './js/ui/navrail.js';
import { initMeasure } from './js/ui/measure.js';
import { initSearch } from './js/ui/search.js';
import { initTracking } from './js/ui/tracking.js';
import { initAccount } from './js/ui/account.js';
import { authConfigured, initAuth } from './js/auth/auth.js';
import { initGraph } from './js/ui/graph.js';
import { openNews, initNews } from './js/ui/news.js';

// ============================================================
//  TERRA-WATCH — Orbital Recon HUD
//  Static, single-page 3D earth + live geolocation overlay.
// ============================================================

const CFG = {
  worldData: 'https://unpkg.com/world-atlas@2.0.2/countries-110m.json',
  radius: 1,
  focusDist: 2.25,
  zoomDist: 1.7,     // closer fly-in used by the "zoom to my location" button
  // Used only if geolocation is denied/unavailable (flagged "SIM" in UI).
  fallback: { lat: 38.9072, lon: -77.0369, alt: 17, sim: true },
};

// ACCENT is mutable: applyStyle() retints it (and the CSS --accent var) so the
// whole HUD + globe re-theme from one place. Keep in sync with styles.css.
const ACCENT = new THREE.Color('#45e0b0');
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------
//  Visual styles (the 4 switcher presets). `accent` drives both the
//  JS materials and the CSS --accent var; `border3d` tints the raised
//  border lines; `arc` (threat only) tints the signal arcs.
// ------------------------------------------------------------
const THEMES = {
  daynight:  { accent: '#46f08a', border3d: '#9bffc0' },   // NORAD amber/green (default)
  political: { accent: '#45e0b0', border3d: '#45e0b0' },   // current teal baseline
  radar:     { accent: '#39ff88', border3d: '#39ff88' },   // phosphor sweep
  threat:    { accent: '#ff5a52', border3d: '#ff8a5a', arc: '#ff7a4a' }, // red board
};
let currentStyle = 'political';

// Coordinate helpers (lonLatToVec3 / vec3ToLonLat / toDMS / gridZone /
// cardinal / polysOf / pointInRing / polyContains) live in js/util/geo.js.

// Equirectangular canvas helper (shared by the day/night texture builders).
// px = (lon+180)/360·W, py = (90-lat)/180·H matches SphereGeometry UVs.
function tracePoly(ctx, poly, W, H) {
  ctx.beginPath();
  for (const ring of poly) {
    ring.forEach(([lon, lat], k) => {
      const x = (lon + 180) / 360 * W, y = (90 - lat) / 180 * H;
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
}

// ============================================================
//  THREE.JS SCENE
// ============================================================
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.5, 3.1);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.rotateSpeed = 0.55;       // re-scaled per-frame by zoom distance (see render loop)
controls.zoomSpeed = 0.7;
controls.zoomToCursor = true;      // dolly toward the point under the pointer (Google-Earth feel)
controls.minDistance = 1.55;
controls.maxDistance = 5;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.32;

const earth = new THREE.Group();
scene.add(earth);

// --- globe sphere ---
// Starts as a uniform dark ocean; loadWorld() builds the per-style materials
// (political / day-night / radar / threat) and applyStyle() swaps them in.
const OCEAN = 0x06121a;
const globeMat = new THREE.MeshBasicMaterial({ color: OCEAN });
const globe = new THREE.Mesh(new THREE.SphereGeometry(CFG.radius, 128, 128), globeMat);
earth.add(globe);

// Per-style globe materials, populated once world data arrives.
const globeMaterials = { political: globeMat };

// --- graticule (lat/long grid) ---
const graticuleMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.10 });
function buildGraticule() {
  const g = new THREE.Group();
  const r = CFG.radius * 1.001;
  for (let lat = -80; lat <= 80; lat += 20) {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 4) pts.push(lonLatToVec3(lon, lat, r));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), graticuleMat));
  }
  for (let lon = -180; lon < 180; lon += 20) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 4) pts.push(lonLatToVec3(lon, lat, r));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), graticuleMat));
  }
  return g;
}
earth.add(buildGraticule());

// 3D border lines (assigned in loadWorld; retinted by applyStyle).
let borderMat = null;
let worldGeo = null;   // topojson country features — used for click → country lookup

// --- atmosphere fresnel glow ---
const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(CFG.radius * 1.16, 64, 64),
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: ACCENT.clone() } },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vNormal;
      uniform vec3 uColor;
      void main() {
        float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.6);
        gl_FragColor = vec4(uColor, 1.0) * intensity;
      }`,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
  })
);
scene.add(atmosphere);

// --- starfield ---
(function stars() {
  const N = 1400, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 30 + Math.random() * 40;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    pos[i*3]   = r * Math.sin(p) * Math.cos(t);
    pos[i*3+1] = r * Math.sin(p) * Math.sin(t);
    pos[i*3+2] = r * Math.cos(p);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x6f8a82, size: 0.06, transparent: true, opacity: 0.7 })));
})();

// ============================================================
//  GLOBE TEXTURES + STYLE LAYERS
// ============================================================

// --- filled-country day texture (built from topojson) ---
// Rasterizes countries onto an equirectangular canvas: ocean fill, filled
// landmasses tinted via `landFn`, and crisp `border` strokes on top. Pass
// `outlineOnly` to skip the fills (radar look).
function buildEarthTexture(geo, opts = {}) {
  const {
    ocean = '#06121a',
    landFn = (i) => `hsl(${150 + ((i*53)%36)}, ${32 + ((i*17)%22)}%, ${24 + ((i*29)%20)}%)`,
    border = 'rgba(120, 240, 205, 0.85)',
    borderWidth = 1.6,
    outlineOnly = false,
  } = opts;

  const W = 4096, H = 2048;
  const cvs = document.createElement('canvas');
  cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext('2d');

  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, W, H);

  if (!outlineOnly) {
    geo.features.forEach((f, i) => {
      if (!f.geometry) return;
      ctx.fillStyle = landFn(i);
      for (const poly of polysOf(f.geometry)) {
        tracePoly(ctx, poly, W, H);
        ctx.fill('evenodd');
      }
    });
  }

  ctx.lineJoin = 'round';
  ctx.lineWidth = borderWidth;
  ctx.strokeStyle = border;
  geo.features.forEach((f) => {
    if (!f.geometry) return;
    for (const poly of polysOf(f.geometry)) {
      tracePoly(ctx, poly, W, H);
      ctx.stroke();
    }
  });

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// --- night texture: dark land + scattered amber city lights ---
// Paints dark land, samples the pixels back to build a land mask, then
// scatters soft glowing dots that fall only on land (no external city DB).
function buildNightTexture(geo) {
  const W = 4096, H = 2048;
  const cvs = document.createElement('canvas');
  cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext('2d');

  ctx.fillStyle = '#020806';                 // near-black ocean (g≈8)
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#06160d';                 // dark land (g≈22)
  geo.features.forEach((f) => {
    if (!f.geometry) return;
    for (const poly of polysOf(f.geometry)) {
      tracePoly(ctx, poly, W, H);
      ctx.fill('evenodd');
    }
  });

  const img = ctx.getImageData(0, 0, W, H).data;
  const isLand = (x, y) => img[(y * W + x) * 4 + 1] > 14;   // land green-channel > ocean

  let placed = 0, tries = 0;
  ctx.fillStyle = 'rgba(255, 200, 110, 1)';
  while (placed < 3500 && tries < 60000) {
    tries++;
    const x = (Math.random() * W) | 0, y = (Math.random() * H) | 0;
    if (!isLand(x, y)) continue;
    const r = Math.random() < 0.15 ? 2.4 : 1.1;
    ctx.globalAlpha = 0.35 + Math.random() * 0.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    placed++;
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// --- day/night blended globe material ---
// Mixes day/night textures by the sun direction (sub-solar point) with a
// glowing terminator band where the two meet.
function makeDayNightMaterial(dayTex, nightTex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDay:   { value: dayTex },
      uNight: { value: nightTex },
      uSunDir:{ value: new THREE.Vector3(1, 0, 0) },
      uTerm:  { value: new THREE.Color('#ffb454') },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalW;
      void main() {
        vUv = uv;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uDay;
      uniform sampler2D uNight;
      uniform vec3 uSunDir;
      uniform vec3 uTerm;
      varying vec2 vUv;
      varying vec3 vNormalW;
      void main() {
        float d = dot(normalize(vNormalW), normalize(uSunDir));
        float dayAmt = smoothstep(-0.12, 0.15, d);
        vec3 day = texture2D(uDay, vUv).rgb;
        vec3 night = texture2D(uNight, vUv).rgb;
        vec3 col = mix(night, day, dayAmt);
        float term = smoothstep(0.12, 0.0, abs(d));   // bright band at d≈0
        col += uTerm * term * 0.45;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// Sub-solar point → world-space sun direction (consistent with lonLatToVec3).
function sunDirection(date = new Date()) {
  const rad = Math.PI / 180;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date - start) / 86400000;
  const decl = -23.44 * Math.cos(rad * (360 / 365) * (dayOfYear + 10));
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const slon = -15 * (hours - 12);
  return lonLatToVec3(slon, decl, 1).normalize();
}
function updateSun() {
  if (globeMaterials.daynight) globeMaterials.daynight.uniforms.uSunDir.value.copy(sunDirection());
}

// --- rotating radar sweep (additive band sweeping around the polar axis) ---
let sweep = null;
function buildRadarSweep() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uAngle: { value: 0 }, uColor: { value: new THREE.Color(THEMES.radar.accent) } },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uAngle;
      uniform vec3 uColor;
      varying vec3 vPos;
      void main() {
        float a = atan(vPos.z, vPos.x);                 // angle around Y axis
        float dist = mod(uAngle - a, 6.2831853);        // distance behind the sweep
        float intensity = smoothstep(2.4, 0.0, dist) * 0.5;
        gl_FragColor = vec4(uColor * intensity, intensity);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(CFG.radius * 1.004, 96, 96), mat);
  mesh.userData.mat = mat;
  mesh.visible = false;
  return mesh;
}
sweep = buildRadarSweep();
earth.add(sweep);

// --- great-circle signal arcs (threat preset) ---
// Arcs from the live fix to a set of stations, each with a traveling glow dot
// and a pulsing target ring. Rebuilt whenever the GPS origin changes.
const STATIONS = [
  [ -0.13,  51.51], [139.69,  35.69], [ -43.17, -22.91],
  [151.21, -33.87], [ 37.62,  55.75], [-157.86,  21.31],
];
let arcsGroup = null;
const arcDots = [];
const arcRings = [];

function buildSignalArcs(originLon, originLat) {
  if (arcsGroup) { earth.remove(arcsGroup); arcsGroup.traverse(o => o.geometry?.dispose?.()); }
  arcsGroup = new THREE.Group();
  arcDots.length = 0; arcRings.length = 0;
  const col = new THREE.Color(THEMES.threat.arc);
  const origin = lonLatToVec3(originLon, originLat, CFG.radius);

  for (const [lon, lat] of STATIONS) {
    const b = lonLatToVec3(lon, lat, CFG.radius);
    const lift = 1 + origin.distanceTo(b) * 0.38;
    const mid = origin.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(CFG.radius * lift);
    const curve = new THREE.QuadraticBezierCurve3(origin.clone(), mid, b);

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
      new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.5 })
    );
    arcsGroup.add(line);

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 8, 8),
      new THREE.MeshBasicMaterial({ color: col })
    );
    dot.userData = { curve, phase: Math.random() };
    arcDots.push(dot);
    arcsGroup.add(dot);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.018, 0.024, 32),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    ring.position.copy(b);
    ring.lookAt(b.clone().multiplyScalar(2));
    ring.userData.phase = Math.random();
    arcRings.push(ring);
    arcsGroup.add(ring);
  }

  arcsGroup.visible = (currentStyle === 'threat');
  earth.add(arcsGroup);
}

// ============================================================
//  STYLE SWITCHER
// ============================================================
function retintMarkerAndArcs() {
  for (const m of markerAccentMats) m.color.set(ACCENT);
}

function applyStyle(name) {
  const t = THEMES[name];
  if (!t) return;
  currentStyle = name;

  // accent sync (JS + CSS)
  ACCENT.set(t.accent);
  document.documentElement.style.setProperty('--accent', t.accent);

  // globe surface
  if (globeMaterials[name]) globe.material = globeMaterials[name];
  if (name === 'daynight') updateSun();

  // shared materials
  graticuleMat.color.set(ACCENT);
  graticuleMat.opacity = (name === 'radar') ? 0.26 : 0.10;
  atmosphere.material.uniforms.uColor.value.set(ACCENT);
  if (borderMat) borderMat.color.set(t.border3d);
  retintMarkerAndArcs();

  // layer visibility
  if (sweep) sweep.visible = (name === 'radar');
  if (arcsGroup) arcsGroup.visible = (name === 'threat');

  // button UI
  document.querySelectorAll('#visual-styles .ss-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.style === name);
  });
}

function setupStyleSwitch() {
  document.querySelectorAll('#visual-styles .ss-btn').forEach((b) => {
    b.addEventListener('click', () => applyStyle(b.dataset.style));
  });
}

// ============================================================
//  COUNTRY NAME LABELS
//  A text sprite at each country's representative point, parented to `earth` so
//  it tracks the globe. depthTest is off (labels are never clipped by the globe
//  mesh), so the render loop hides any label on the far hemisphere and drops the
//  small countries when zoomed far back to keep the globe readable.
// ============================================================
let labelsGroup = null;
const labelSprites = [];

// Representative lon/lat for a feature: average the vertices of its largest ring
// (the main landmass), plus its angular span (used to thin labels when zoomed out).
function featureAnchor(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates]
    : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let best = null, bestLen = 0;
  for (const poly of polys) {
    const ring = poly[0];
    if (ring && ring.length > bestLen) { bestLen = ring.length; best = ring; }
  }
  if (!best) return null;
  let x = 0, y = 0, minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
  for (const [lon, lat] of best) {
    x += lon; y += lat;
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  return { lon: x / best.length, lat: y / best.length, span: Math.max(maxLon - minLon, maxLat - minLat) };
}

// Text → canvas → sprite (mono HUD font, dark halo for legibility over land).
function makeLabelSprite(text) {
  const font = 30, padX = 10, padY = 8;
  const cvs = document.createElement('canvas');
  let ctx = cvs.getContext('2d');
  ctx.font = `${font}px 'Share Tech Mono', monospace`;
  cvs.width = Math.ceil(ctx.measureText(text).width) + padX * 2;
  cvs.height = font + padY * 2;
  ctx = cvs.getContext('2d');                       // resizing the canvas resets the context
  ctx.font = `${font}px 'Share Tech Mono', monospace`;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(2, 8, 6, 0.85)';
  ctx.strokeText(text, padX, cvs.height / 2);
  ctx.fillStyle = 'rgba(220, 235, 228, 0.96)';
  ctx.fillText(text, padX, cvs.height / 2);
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false,
  }));
  const h = 0.026;                                  // world-space label height
  sp.scale.set(h * (cvs.width / cvs.height), h, 1);
  return sp;
}

function buildCountryLabels(geo) {
  labelsGroup = new THREE.Group();
  labelSprites.length = 0;
  const r = CFG.radius * 1.012;
  for (const f of geo.features) {
    const name = f.properties?.name;
    if (!name || !f.geometry) continue;
    const a = featureAnchor(f.geometry);
    if (!a) continue;
    const sp = makeLabelSprite(name);
    const pos = lonLatToVec3(a.lon, a.lat, r);
    sp.position.copy(pos);
    sp.userData.dir = pos.clone().normalize();
    sp.userData.span = a.span;
    labelsGroup.add(sp);
    labelSprites.push(sp);
  }
  earth.add(labelsGroup);
}

// --- world data (loaded async): builds all per-style globe materials ---
async function loadWorld() {
  try {
    const topo = await fetch(CFG.worldData).then(r => r.json());
    const geo = topojson.feature(topo, topo.objects.countries);
    worldGeo = geo;   // expose for click → country detection

    // political (teal baseline) — replaces the plain ocean material.
    globeMaterials.political = new THREE.MeshBasicMaterial({ map: buildEarthTexture(geo) });

    // day/night (NORAD amber/green): green day map + amber night lights.
    const dayTex = buildEarthTexture(geo, {
      ocean: '#04160d',
      landFn: (i) => `hsl(${120 + ((i*47)%34)}, ${42 + ((i*17)%22)}%, ${22 + ((i*29)%16)}%)`,
      border: 'rgba(120, 255, 160, 0.85)',
    });
    globeMaterials.daynight = makeDayNightMaterial(dayTex, buildNightTexture(geo));

    // radar: dark globe, outline-only land.
    globeMaterials.radar = new THREE.MeshBasicMaterial({
      map: buildEarthTexture(geo, { ocean: '#03100a', outlineOnly: true, border: 'rgba(70, 255, 150, 0.7)', borderWidth: 1.4 }),
    });

    // threat: dim red land.
    globeMaterials.threat = new THREE.MeshBasicMaterial({
      map: buildEarthTexture(geo, {
        ocean: '#100406',
        landFn: (i) => `hsl(${(i*23)%18}, ${38 + ((i*17)%20)}%, ${16 + ((i*29)%14)}%)`,
        border: 'rgba(255, 120, 90, 0.8)',
      }),
    });

    // Raised accent border lines (retinted per style by applyStyle).
    borderMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.35 });
    const group = new THREE.Group();
    const r = CFG.radius * 1.0015;
    const addRing = (ring) => {
      const pts = ring.map(([lon, lat]) => lonLatToVec3(lon, lat, r));
      group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), borderMat));
    };
    for (const f of geo.features) {
      const gm = f.geometry; if (!gm) continue;
      if (gm.type === 'Polygon') gm.coordinates.forEach(addRing);
      else if (gm.type === 'MultiPolygon') gm.coordinates.forEach(poly => poly.forEach(addRing));
    }
    earth.add(group);
    buildCountryLabels(geo);

    bootLog('LANDMASS VECTORS LOADED · ' + geo.features.length + ' FEATURES');
    return true;
  } catch (e) {
    bootLog('! WORLD DATA UNREACHABLE — GRID ONLY');
    return false;
  }
}

// ============================================================
//  LOCATION MARKER
// ============================================================
let marker = null;
const rings = [];
const markerAccentMats = [];   // accent-tinted marker materials (retinted on style switch)

function placeMarker(lon, lat) {
  if (marker) earth.remove(marker);
  marker = new THREE.Group();
  markerAccentMats.length = 0;
  const surface = lonLatToVec3(lon, lat, CFG.radius);
  marker.position.copy(surface);
  marker.lookAt(surface.clone().multiplyScalar(2)); // +Z points outward

  marker.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  ));

  const beamMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.7 });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.32, 6), beamMat);
  beam.rotation.x = Math.PI / 2;
  beam.position.z = 0.16;
  marker.add(beam);
  markerAccentMats.push(beamMat);

  const tipMat = new THREE.MeshBasicMaterial({ color: ACCENT });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 12), tipMat);
  tip.position.z = 0.32;
  marker.add(tip);
  markerAccentMats.push(tipMat);

  rings.length = 0;
  for (let i = 0; i < 3; i++) {
    const ringMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.026, 48), ringMat);
    ring.userData.phase = i / 3;
    marker.add(ring);
    rings.push(ring);
    markerAccentMats.push(ringMat);
  }
  earth.add(marker);
}

// ============================================================
//  CAMERA FOCUS (fly to coordinate)
// ============================================================
// --- camera "fly to / track" (Google-Maps-style locate) ---
let lastFix = null;          // {lon, lat} of the most recent position fix
let hasAutoFocused = false;  // gently centre the first fix automatically
let steering = false;        // easing the camera toward a target each frame
let following = false;       // keep re-centring on every new fix (track mode)
const targetDir = new THREE.Vector3();
let targetR = CFG.focusDist;

// Geometric slerp between two unit vectors — arcs the camera around the globe
// at a controlled radius (no chord cutting through the surface).
const _rel = new THREE.Vector3();
function slerpDir(out, a, b, t) {
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  if (dot > 0.9999) { out.copy(b); return; }
  const theta = Math.acos(dot) * t;
  _rel.copy(b).addScaledVector(a, -dot).normalize();
  out.copy(a).multiplyScalar(Math.cos(theta)).addScaledVector(_rel, Math.sin(theta));
}

// Aim the camera at a coordinate; the render loop eases it there. While
// `following`, this is re-issued on every fix so the location stays centred.
function steerTo(lon, lat, dist) {
  targetDir.copy(lonLatToVec3(lon, lat, 1)).normalize();
  if (dist != null) targetR = dist;
  steering = true;
  controls.autoRotate = false;
}

// Locate button → recentre, zoom in, and enter track mode.
$('goto-loc')?.addEventListener('click', () => {
  if (!lastFix) return;
  // In street mode, recenter the tile map on the fix and resume tracking.
  if (streetActive) {
    streetFollow = true;
    smap.setView([lastFix.lat, lastFix.lon], Math.max(smap.getZoom(), STREET_ENTER_ZOOM), { animate: true });
    $('goto-loc').classList.add('active');
    return;
  }
  following = true;
  $('goto-loc').classList.add('active');
  steerTo(lastFix.lon, lastFix.lat, CFG.zoomDist);
});

// Any manual orbit/zoom drops track mode and hands control back (like a map).
controls.addEventListener('start', () => {
  steering = false;
  if (following) { following = false; $('goto-loc')?.classList.remove('active'); }
});

// ============================================================
//  STREET-LEVEL MAP / KEYZOOM HANDOFF (Leaflet + Esri imagery)
//  Google-Maps-style continuous zoom. The 3D globe owns the low zoom levels
//  (world → country); once you zoom in past the KEYZOOM the view hands off to a
//  full-viewport satellite tile map that goes down to street level and keeps
//  tracking the live GPS fix. Zooming back out past the keyzoom (or the
//  "BACK TO GLOBE" button) returns to the globe. Leaflet is loaded as a classic
//  script in index.html (global `L`); the map is built lazily on first handoff.
// ============================================================
const KEYZOOM = 10;                                // globe → tiles handoff level (globe owns Z02–Z10)
// Esri World Imagery's deepest real tile varies by region: z19 in well-mapped
// metros but only ~z17 in remote areas (rural/desert/ocean). Past a region's
// native level Esri returns a "Map data not available" placeholder (a 200, so
// Leaflet can't detect it). z17 is the level present everywhere we probed, so we
// cap native requests there and upscale to the display cap — blurry, never blank.
const SAT_NATIVE_MAX = 17;                         // globally-guaranteed Esri imagery level
const STREET_MAX = 19;                             // display zoom cap (upscales z17 tiles ≤4×)
const STREET_ENTER_ZOOM = 17;                      // zoom we hand off into (street level, native imagery max)
const GLOBE_ZOOM_MIN = 2;                          // globe pulled fully out (≈ world)
const GLOBE_ZOOM_MAX = KEYZOOM;                    // globe zoomed fully in (= keyzoom)
const ENTER_DIST = controls.minDistance + 0.06;    // hand off to street at/under this camera range
const EXIT_DIST  = controls.minDistance + 0.55;    // camera range restored when returning to the globe

const smapEl = $('streetmap');
let smap = null, smapMarker = null, smapAcc = null;
let streetActive = false;     // full-viewport street map is showing
let streetFollow = false;     // recenter the map on every new GPS fix
let exitCooldown = 0;         // ignore re-handoff briefly after exiting (ms timestamp)

// Continuous Google-style zoom level for the HUD readout + ORBIT/STREET tag.
function setZoomReadout() {
  let z, mode;
  if (streetActive && smap) { z = smap.getZoom(); mode = 'STREET'; }
  else {
    const d = camera.position.length();
    const t = THREE.MathUtils.clamp((d - controls.minDistance) / (controls.maxDistance - controls.minDistance), 0, 1);
    z = GLOBE_ZOOM_MAX - t * (GLOBE_ZOOM_MAX - GLOBE_ZOOM_MIN);   // min dist → keyzoom, max → world
    mode = 'ORBIT';
  }
  const lvl = $('zoom-lvl'), md = $('zoom-mode');
  if (lvl) lvl.textContent = 'Z' + String(Math.round(z)).padStart(2, '0');
  if (md) { md.textContent = mode; md.classList.toggle('street', mode === 'STREET'); }
}

function buildStreetMap(lon, lat, zoom) {
  smap = window.L.map('sm-canvas', {
    zoomControl: false, attributionControl: true,
    minZoom: KEYZOOM - 1, maxZoom: STREET_MAX,    // < KEYZOOM exits back to the globe
  }).setView([lat, lon], zoom);
  window.L.control.zoom({ position: 'bottomright' }).addTo(smap);

  // Esri World Imagery (satellite) + a transparent place/road labels overlay
  // so streets stay legible over the aerial photography. Both keyless. Native
  // requests are capped at SAT_NATIVE_MAX so Leaflet upscales the real tile past
  // it instead of fetching Esri's "Map data not available" placeholder.
  window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: STREET_MAX, maxNativeZoom: SAT_NATIVE_MAX, errorTileUrl: '',
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  }).addTo(smap);
  window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: STREET_MAX, maxNativeZoom: SAT_NATIVE_MAX, opacity: 0.9,
  }).addTo(smap);

  smapAcc = window.L.circle([lat, lon], { radius: 0, color: '#45e0b0', weight: 1, fillColor: '#45e0b0', fillOpacity: 0.12 }).addTo(smap);
  smapMarker = window.L.marker([lat, lon]).addTo(smap);

  smap.on('zoomend', () => { setZoomReadout(); if (smap.getZoom() < KEYZOOM) exitStreet(); });
  smap.on('dragstart', () => { streetFollow = false; });   // manual pan → stop tracking
}

// Hand off from the globe to the street map (lazily building it the first time).
function enterStreet(lon, lat, zoom = STREET_ENTER_ZOOM, follow = false) {
  if (!window.L || streetActive) return;
  streetActive = true;
  streetFollow = follow;
  steering = false;
  controls.autoRotate = false;
  smapEl.removeAttribute('hidden');
  const stBtn = $('street-toggle');
  if (stBtn) { stBtn.classList.add('active'); stBtn.textContent = '◄ EXIT STREET'; }
  if (!smap) buildStreetMap(lon, lat, zoom);
  else smap.setView([lat, lon], zoom, { animate: false });
  // Leaflet must recompute size once the container is actually visible.
  setTimeout(() => smap && smap.invalidateSize(), 50);
  drawMeasureStreet(measure.vertices());   // mirror any active measurement onto the tiles
  setStatus('STREET-LEVEL VIEW · ' + (follow ? 'TRACKING GNSS' : 'MANUAL PAN'));
  setZoomReadout();
}

// Return to the globe, re-centered on wherever the street map was looking.
function exitStreet() {
  if (!streetActive) return;
  streetActive = false;
  streetFollow = false;
  following = false;
  const c = smap ? smap.getCenter() : null;
  smapEl.setAttribute('hidden', '');
  const stBtn = $('street-toggle');
  if (stBtn) { stBtn.classList.remove('active'); stBtn.textContent = '▣ STREET LEVEL'; }
  $('goto-loc')?.classList.remove('active');
  exitCooldown = performance.now() + 800;          // debounce so it doesn't snap straight back
  if (c) {
    // Park the camera above the handoff threshold so we don't immediately re-enter.
    camera.position.copy(lonLatToVec3(c.lng, c.lat, 1).normalize().multiplyScalar(EXIT_DIST));
    controls.update();
  }
  setStatus('ORBITAL VIEW RESTORED');
  setZoomReadout();
}

// Keep the street marker + accuracy ring on the live fix (called from onPosition).
function syncStreet(lon, lat, accuracy) {
  if (!streetActive || !smap) return;
  smapMarker.setLatLng([lat, lon]);
  if (smapAcc) smapAcc.setLatLng([lat, lon]).setRadius(accuracy || 0);
  if (streetFollow) smap.panTo([lat, lon], { animate: true });
}

// Street-map controls: the toggle enters/exits; the on-map button exits.
$('street-toggle')?.addEventListener('click', () => {
  if (streetActive) { exitStreet(); return; }
  if (lastFix) enterStreet(lastFix.lon, lastFix.lat, STREET_ENTER_ZOOM, true);
  else { const c = vec3ToLonLat(camera.position); enterStreet(c.lon, c.lat, STREET_ENTER_ZOOM, false); }
});
$('sm-exit')?.addEventListener('click', exitStreet);

// ============================================================
//  COUNTRY NEWS (click a country → lightbox of top-10 headlines)
//  Raycast the click onto the globe → lon/lat → point-in-polygon against the
//  loaded country features → fetch recent headlines from Google News (no API key).
// ============================================================

// vec3ToLonLat / polyContains (and pointInRing) live in js/util/geo.js.
function countryAt(lon, lat) {
  if (!worldGeo) return null;
  for (const f of worldGeo.features) {
    const gm = f.geometry; if (!gm) continue;
    for (const poly of polysOf(gm)) if (polyContains(poly, lon, lat)) return f.properties?.name || null;
  }
  return null;
}

// ============================================================
//  MEASURE TOOL — great-circle distance / bearing overlay
//  The Measure workspace (js/ui/measure.js) owns the vertex list + readout; here
//  we own the scene side: a geodesic polyline + vertex dots parented to `earth`,
//  mirrored as a Leaflet polyline on the street map. In measure mode a globe
//  click drops a vertex (handled in the pointerup picker below) and is swallowed
//  so it never triggers the country-news lookup; orbit/drag are untouched.
// ============================================================
const measureGroup = new THREE.Group();
earth.add(measureGroup);
const measureLineMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95 });
const measureDotMat = new THREE.MeshBasicMaterial({ color: ACCENT });
const measureDotGeo = new THREE.SphereGeometry(CFG.radius * 0.006, 10, 10);
let smapMeasureLine = null;   // Leaflet polyline mirror on the street map

// Stitch the geodesic legs into one continuous [{lon,lat}] path.
function measurePath(verts) {
  const path = [];
  for (let i = 1; i < verts.length; i++) {
    const seg = greatCirclePoints(verts[i - 1].lon, verts[i - 1].lat, verts[i].lon, verts[i].lat, 48);
    if (i > 1) seg.shift();   // drop the vertex shared with the previous leg
    path.push(...seg);
  }
  return path;
}

function drawMeasureGlobe(verts) {
  for (const c of measureGroup.children.slice()) {
    measureGroup.remove(c);
    if (c.isLine) c.geometry.dispose();   // dots reuse the shared measureDotGeo
  }
  const r = CFG.radius * 1.004;           // float just above the surface
  if (verts.length >= 2) {
    const pts = measurePath(verts).map((p) => lonLatToVec3(p.lon, p.lat, r));
    measureGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), measureLineMat));
  }
  for (const v of verts) {
    const dot = new THREE.Mesh(measureDotGeo, measureDotMat);
    dot.position.copy(lonLatToVec3(v.lon, v.lat, r));
    measureGroup.add(dot);
  }
}

function drawMeasureStreet(verts) {
  if (!smap) return;
  if (smapMeasureLine) { smap.removeLayer(smapMeasureLine); smapMeasureLine = null; }
  if (verts.length < 2) return;
  const latlngs = measurePath(verts).map((p) => [p.lat, p.lon]);
  smapMeasureLine = window.L.polyline(latlngs, { color: '#45e0b0', weight: 2, opacity: 0.9, dashArray: '4 4' }).addTo(smap);
}

const measure = initMeasure({
  toggleBtn: $('measure-toggle'), clearBtn: $('measure-clear'), readout: $('measure-out'),
  onChange: (verts) => { drawMeasureGlobe(verts); if (streetActive) drawMeasureStreet(verts); },
  onActiveChange: (on) => {
    document.body.classList.toggle('measuring', on);
    setStatus(on ? 'MEASURE MODE · CLICK GLOBE TO DROP VERTICES' : 'MEASURE MODE OFF');
  },
});

// --- click vs. drag detection on the globe ---
// markersGroup holds all dashboard layer markers (assigned in the orchestration
// section); raycasting tests it alongside the globe so a marker click wins over
// the country lookup, while a marker hidden behind the globe falls through.
let markersGroup = null;
const raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
let _downX = 0, _downY = 0, _downT = 0;
canvas.addEventListener('pointerdown', (e) => { _downX = e.clientX; _downY = e.clientY; _downT = performance.now(); });
canvas.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - _downX, e.clientY - _downY) > 6 || performance.now() - _downT > 500) return; // a drag
  const rect = canvas.getBoundingClientRect();
  _ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(_ndc, camera);
  // Measure mode: a globe click drops a vertex and is swallowed (no country/news
  // lookup, no marker open). Raycast the globe only so a vertex always lands on
  // the surface even under a marker. A miss (ocean edge / off-globe) is ignored.
  if (measure.isActive()) {
    const ghit = raycaster.intersectObject(globe, true)[0];
    if (ghit) { const { lon, lat } = vec3ToLonLat(ghit.point); measure.addVertex(lon, lat); }
    return;
  }
  const targets = markersGroup ? [globe, markersGroup] : [globe];
  const hit = raycaster.intersectObjects(targets, true)[0];
  if (!hit) return;
  // Closest hit is a dashboard marker → open it in the inspector.
  if (typeof hit.object.userData?.pick === 'function') { hit.object.userData.pick(); return; }
  // Otherwise it's the globe surface → country news lookup (unchanged).
  const { lon, lat } = vec3ToLonLat(hit.point);
  const name = countryAt(lon, lat);
  if (name) openNews(name);
  else setStatus('NO COUNTRY UNDER CURSOR · OCEAN OR UNMAPPED');
});

// --- news fetch + lightbox (moved to js/ui/news.js) ---
// openNews() is imported at the top; wire its close/backdrop/Escape handlers.
initNews();

// ============================================================
//  MOBILE PANEL TRAY + PANEL LIGHTBOX
//  On narrow screens the fixed compass/telemetry docks are relocated into the
//  bottom tray (collapse to free the globe). The COMPASS / TELEMETRY buttons
//  pop a single panel up as a centered, full-size lightbox. Desktop is untouched
//  — the panels move back to <body> and keep their fixed docks. The panel nodes
//  are *moved*, never duplicated, so every id app.js writes into stays live.
// ============================================================
(function setupTray() {
  const trayBody = $('tray-body');
  const toggle   = $('tray-toggle');
  const backdrop = $('panel-backdrop');
  const compass   = document.querySelector('.panel-left');
  const telemetry = document.querySelector('.panel-right');
  if (!trayBody || !toggle || !backdrop || !compass || !telemetry) return;

  const mq = window.matchMedia('(max-width: 760px)');

  function closeLightbox() {
    compass.classList.remove('as-lightbox');
    telemetry.classList.remove('as-lightbox');
    backdrop.setAttribute('hidden', '');
    if (mq.matches) { trayBody.appendChild(compass); trayBody.appendChild(telemetry); }
  }

  // Pop one panel as a lightbox. Lift it out of the (possibly collapsed) tray to
  // <body> first, else a display:none tray ancestor would keep it invisible.
  function openLightbox(panel) {
    if (!mq.matches) return;
    const wasOpen = panel.classList.contains('as-lightbox');
    closeLightbox();
    if (!wasOpen) {
      document.body.appendChild(panel);
      panel.classList.add('as-lightbox');
      backdrop.removeAttribute('hidden');
    }
  }

  // Place the docks for the current breakpoint: into the tray on mobile, back to
  // their fixed positions on desktop.
  function applyLayout() {
    if (mq.matches) {
      trayBody.appendChild(compass);
      trayBody.appendChild(telemetry);
    } else {
      compass.classList.remove('as-lightbox');
      telemetry.classList.remove('as-lightbox');
      backdrop.setAttribute('hidden', '');
      document.body.classList.remove('tray-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = '▲ PANELS';
      document.body.appendChild(compass);
      document.body.appendChild(telemetry);
    }
  }

  toggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('tray-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = (open ? '▼' : '▲') + ' PANELS';
    if (!open) closeLightbox();
  });

  $('open-compass')?.addEventListener('click', () => openLightbox(compass));
  $('open-telemetry')?.addEventListener('click', () => openLightbox(telemetry));
  backdrop.addEventListener('click', closeLightbox);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

  mq.addEventListener('change', applyLayout);
  applyLayout();
})();

// ============================================================
//  HUD STATE + UPDATES
// ============================================================
const sid = (Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 4)).toUpperCase();
$('sid').textContent = sid;

function pad(n, l = 2) { return String(Math.floor(n)).padStart(l, '0'); }
const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function tickClock() {
  const d = new Date();
  const dtg = `${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z ${MON[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
  $('dtg').textContent = dtg;
  $('zulu').textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}
setInterval(tickClock, 1000);
tickClock();

function setStatus(msg) { $('sb-msg').textContent = msg; }

// Dashboard hooks: the orchestration section pushes listeners here so trail
// capture / "near me" alerts / opt-in weather all fan out from the single
// onPosition sink without coupling geolocation to those features.
const positionListeners = [];

function onPosition(lon, lat, alt, extra = {}, sim = false) {
  lastFix = { lon, lat };
  placeMarker(lon, lat);
  buildSignalArcs(lon, lat);
  if (!hasAutoFocused) {
    hasAutoFocused = true;
    steerTo(lon, lat);                              // position the globe behind the handoff
    // Default to street-level on the first fix so you can watch live where you're
    // going. A real GNSS fix enters TRACKING; the simulated fallback enters in
    // MANUAL PAN (follow=false) so it doesn't falsely claim a live track.
    if (window.L) enterStreet(lon, lat, STREET_ENTER_ZOOM, !sim);
  } else if (following) steerTo(lon, lat);   // track mode: keep it centred, hold zoom
  syncStreet(lon, lat, extra.accuracy);     // keep the street map on the device

  $('lat').textContent = (lat >= 0 ? '+' : '') + lat.toFixed(6);
  $('lon').textContent = (lon >= 0 ? '+' : '') + lon.toFixed(6);
  $('lat-dms').textContent = toDMS(lat, ['N', 'S']);
  $('lon-dms').textContent = toDMS(lon, ['E', 'W']);

  const altM = alt ?? 0;
  $('alt').textContent = `${altM.toFixed(0)} m`;
  $('alt-ft').textContent = `${(altM * 3.28084).toFixed(0)} ft MSL`;

  $('acc').textContent  = extra.accuracy != null ? `${extra.accuracy.toFixed(0)} m` : '— m';
  $('vacc').textContent = extra.altAccuracy != null ? `${extra.altAccuracy.toFixed(0)} m` : '— m';
  $('spd').textContent  = extra.speed != null ? `${extra.speed.toFixed(1)} m/s` : '0.0 m/s';
  $('crs').textContent  = extra.course != null ? `${pad(extra.course, 3)}°` : '---°';

  $('grid').textContent = gridZone(lat, lon);
  $('hemi').textContent = `${lat >= 0 ? 'NORTHERN' : 'SOUTHERN'} HEMISPHERE · ${lon >= 0 ? 'E' : 'W'} LON`;

  $('upd').textContent = new Date().toTimeString().slice(0, 8);
  $('src').textContent = sim ? 'SIMULATED' : 'DEVICE GNSS';

  const fixTag = $('fix-tag');
  fixTag.textContent = sim ? 'SIM FIX' : '3D FIX';
  fixTag.className = sim ? 'ph-tag warn' : 'ph-tag ok';

  const fix = $('stat-fix');
  fix.querySelector('.dot').className = 'dot ok';
  fix.querySelector('.stat-v').textContent = sim ? 'SIM' : 'LOCK';

  setStatus(sim
    ? 'POSITION SIMULATED · DEVICE GEOLOCATION UNAVAILABLE'
    : `FIX ACQUIRED · ${gridZone(lat, lon)} · TRACKING`);

  for (const fn of positionListeners) { try { fn(lon, lat, alt, extra, sim); } catch (_) {} }
}

// ============================================================
//  GEOLOCATION
// ============================================================
function startGeo() {
  if (!('geolocation' in navigator)) {
    bootLog('! NO GEOLOCATION API — ENGAGING SIM MODE');
    const f = CFG.fallback;
    onPosition(f.lon, f.lat, f.alt, {}, true);
    return;
  }
  bootLog('REQUESTING GNSS FIX…');
  navigator.geolocation.watchPosition(
    (p) => {
      const c = p.coords;
      bootLog('GNSS FIX · ' + c.latitude.toFixed(4) + ' / ' + c.longitude.toFixed(4));
      onPosition(c.longitude, c.latitude, c.altitude, {
        accuracy: c.accuracy,
        altAccuracy: c.altitudeAccuracy,
        speed: c.speed,
        course: c.heading,
      }, false);
    },
    (err) => {
      bootLog('! GNSS DENIED (' + err.code + ') — SIM MODE');
      const fix = $('stat-fix');
      fix.querySelector('.dot').className = 'dot bad';
      fix.querySelector('.stat-v').textContent = 'DENY';
      const f = CFG.fallback;
      onPosition(f.lon, f.lat, f.alt, {}, true);
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 }
  );
}

// ============================================================
//  COMPASS
// ============================================================
const rose = $('rose');
(function buildRose() {
  const cx = 120, cy = 120, ns = 'http://www.w3.org/2000/svg';
  for (let a = 0; a < 360; a += 5) {
    const major = a % 30 === 0;
    const r1 = major ? 84 : 88, r2 = 96;
    const rad = (a - 90) * Math.PI / 180;
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('x1', cx + r1 * Math.cos(rad));
    l.setAttribute('y1', cy + r1 * Math.sin(rad));
    l.setAttribute('x2', cx + r2 * Math.cos(rad));
    l.setAttribute('y2', cy + r2 * Math.sin(rad));
    l.setAttribute('class', major ? 'tick major' : 'tick');
    l.setAttribute('stroke-width', major ? 1.6 : 0.8);
    rose.appendChild(l);
  }
  const labels = [['N',0],['E',90],['S',180],['W',270],['30',30],['60',60],['120',120],['150',150],['210',210],['240',240],['300',300],['330',330]];
  for (const [txt, a] of labels) {
    const rad = (a - 90) * Math.PI / 180, r = 70;
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', cx + r * Math.cos(rad));
    t.setAttribute('y', cy + r * Math.sin(rad) + 5);
    t.setAttribute('class', ['N','E','S','W'].includes(txt) ? 'card' : '');
    t.textContent = txt;
    rose.appendChild(t);
  }
  const ndl = document.createElementNS(ns, 'polygon');
  ndl.setAttribute('points', '120,58 114,120 126,120');
  ndl.setAttribute('class', 'needle-n');
  rose.appendChild(ndl);
  const sth = document.createElementNS(ns, 'polygon');
  sth.setAttribute('points', '120,182 114,120 126,120');
  sth.setAttribute('class', 'needle-s');
  rose.appendChild(sth);
})();

let heading = 0, headingLive = false;

function renderCompass() {
  rose.setAttribute('transform', `rotate(${-heading} 120 120)`);
  $('hdg-deg').textContent = pad(heading, 3) + '°';
  $('hdg-card').textContent = cardinal(heading);
}
renderCompass();

function onOrient(e) {
  let hdg = null;
  if (typeof e.webkitCompassHeading === 'number') hdg = e.webkitCompassHeading;       // iOS true heading
  else if (e.absolute && typeof e.alpha === 'number') hdg = 360 - e.alpha;             // standard
  if (hdg == null) return;
  heading = (hdg + 360) % 360;
  if (!headingLive) { headingLive = true; $('hdg-src').textContent = 'LIVE'; }
  if (e.beta != null) $('tilt').textContent = `${e.beta.toFixed(0)}°`;
  renderCompass();
}

function initCompass() {
  const needsPerm = typeof DeviceOrientationEvent !== 'undefined'
    && typeof DeviceOrientationEvent.requestPermission === 'function';
  if (needsPerm) {
    const btn = $('compass-enable');
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res === 'granted') {
          window.addEventListener('deviceorientation', onOrient, true);
          btn.hidden = true;
        }
      } catch (_) {}
    });
  } else if (typeof window.DeviceOrientationEvent !== 'undefined') {
    window.addEventListener('deviceorientationabsolute', onOrient, true);
    window.addEventListener('deviceorientation', onOrient, true);
  }
  // Until a real magnetometer event arrives (never, on a laptop), the compass
  // tracks the camera's bearing around the globe — see the render loop.
  if (!headingLive) $('hdg-src').textContent = 'VIEW';
}

// ============================================================
//  BOOT SEQUENCE
// ============================================================
const bootLogEl = $('boot-log');
function bootLog(msg) {
  if (!bootLogEl) return;
  const line = document.createElement('div');
  line.textContent = '> ' + msg;
  bootLogEl.appendChild(line);
  bootLogEl.scrollTop = bootLogEl.scrollHeight;
}

async function boot() {
  const bar = $('bootbar');
  const steps = [
    [10, 'INITIALIZING RENDER PIPELINE'],
    [25, 'BUILDING GEODESIC GRID'],
    [45, 'LOADING TERRAIN VECTORS'],
    [70, 'CALIBRATING COMPASS'],
    [90, 'LINKING GNSS RECEIVER'],
  ];
  for (const [pct, msg] of steps) {
    bar.style.width = pct + '%';
    bootLog(msg);
    await new Promise(r => setTimeout(r, 280));
  }
  await loadWorld();
  setupStyleSwitch();
  applyStyle('daynight');          // default preset
  bar.style.width = '100%';
  bootLog('UPLINK ESTABLISHED');
  initCompass();
  startGeo();
  await new Promise(r => setTimeout(r, 500));
  $('boot').classList.add('hide');
}
boot();

// ============================================================
//  RENDER LOOP
// ============================================================
let last = performance.now(), frames = 0, fpsT = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = (now - last) / 1000; last = now;

  // The full-screen street map covers the globe — skip all globe rendering while
  // it's up (Leaflet drives its own view + GPS tracking).
  if (streetActive) return;

  // Keyzoom handoff: once the globe is zoomed all the way in, hand off to the
  // street-level tile map — centered on the fix while tracking, else on the
  // point currently centered in view.
  if (performance.now() > exitCooldown && camera.position.length() <= ENTER_DIST) {
    if (following && lastFix) enterStreet(lastFix.lon, lastFix.lat, STREET_ENTER_ZOOM, true);
    else { const c = vec3ToLonLat(camera.position); enterStreet(c.lon, c.lat, STREET_ENTER_ZOOM, false); }
    return;
  }

  if (steering) {
    const curDir = camera.position.clone().normalize();
    const curR = camera.position.length();
    const newDir = new THREE.Vector3();
    slerpDir(newDir, curDir, targetDir, 0.09);
    const newR = curR + (targetR - curR) * 0.09;
    camera.position.copy(newDir.multiplyScalar(newR));
    // Stop once settled — unless we're tracking, where steering stays live.
    if (!following && curDir.angleTo(targetDir) < 0.002 && Math.abs(newR - targetR) < 0.004) steering = false;
  }

  // Keep the location pin readable: it shrinks as you zoom in and grows as you
  // pull back (clamped), so a close-in view isn't swamped by the marker.
  if (marker) marker.scale.setScalar(THREE.MathUtils.clamp(camera.position.length() * 0.44, 0.5, 1.35));

  for (const ring of rings) {
    ring.userData.phase = (ring.userData.phase + dt * 0.5) % 1;
    const s = 1 + ring.userData.phase * 7;
    ring.scale.set(s, s, s);
    ring.material.opacity = 0.9 * (1 - ring.userData.phase);
  }

  // --- per-style animation (only the active layer does work) ---
  if (currentStyle === 'daynight') {
    updateSun();
  } else if (currentStyle === 'radar' && sweep) {
    const u = sweep.userData.mat.uniforms.uAngle;
    u.value = (u.value + dt * 1.1) % (Math.PI * 2);
  } else if (currentStyle === 'threat' && arcsGroup) {
    for (const d of arcDots) {
      d.userData.phase = (d.userData.phase + dt * 0.18) % 1;
      d.position.copy(d.userData.curve.getPointAt(d.userData.phase));
    }
    for (const r of arcRings) {
      r.userData.phase = (r.userData.phase + dt * 0.6) % 1;
      const s = 1 + r.userData.phase * 3;
      r.scale.set(s, s, s);
      r.material.opacity = 0.9 * (1 - r.userData.phase);
    }
  }

  // Rotate slower the closer you are, so dragging near the surface nudges the
  // globe instead of whipping it around (constant-ish screen-space drag feel).
  {
    const zt = THREE.MathUtils.clamp(
      (camera.position.length() - controls.minDistance) / (controls.maxDistance - controls.minDistance), 0, 1);
    controls.rotateSpeed = THREE.MathUtils.lerp(0.15, 0.6, zt);
  }

  controls.update();

  // Country labels: keep only those on the camera-facing hemisphere, and when
  // pulled far back show just the larger countries so the globe stays readable.
  if (labelsGroup) {
    const camDir = camera.position.clone().normalize();
    const showSmall = camera.position.length() < 2.4;
    for (const s of labelSprites) {
      s.visible = s.userData.dir.dot(camDir) > 0.32 && (showSmall || s.userData.span > 11);
    }
  }

  // No device magnetometer (e.g. desktop/laptop): derive heading from the
  // camera's azimuth so the rose responds live as the user orbits the globe.
  if (!headingLive) {
    heading = (THREE.MathUtils.radToDeg(controls.getAzimuthalAngle()) + 360) % 360;
    renderCompass();
  }

  renderer.render(scene, camera);

  $('sb-rng').textContent = camera.position.length().toFixed(2) + ' R';
  frames++; fpsT += dt;
  if (fpsT >= 0.5) { $('sb-fps').textContent = Math.round(frames / fpsT); frames = 0; fpsT = 0; setZoomReadout(); }
}
requestAnimationFrame(animate);

// ============================================================
//  RESIZE
// ============================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
//  DASHBOARD ORCHESTRATION (Terra-Watch Phase 1)
//  Wires the new ESM modules to the globe: intel layers + markers, market feed,
//  command palette, entity inspector, watchlist + breadcrumb trail (localStorage
//  only), and lightweight alerts. All globe primitives above (lonLatToVec3,
//  earth, onPosition hook, raycast picker) are reused — nothing is duplicated.
// ============================================================
(function dashboard() {
  // ---- persisted local state (namespaced; never leaves the device) ----
  const prefs = lsLoad('prefs', { ownWeather: false });
  let watchlist = lsLoad('watchlist', []);   // [{id,name,lon,lat,addedAt}]
  let trail = lsLoad('trail', []);            // [{lon,lat,t}]
  const savePrefs = () => lsSave('prefs', prefs);

  // ---- selection bus: one source of truth for "what is selected", by entity id.
  //      onPickRelation publishes to it now; the globe/inspector subscriber that
  //      reacts is added in the next step. ----
  const selection = createSelection();

  // ---- ontology: seed market centers + a hub so the inspector can show links ----
  const onto = createOntology();
  const HUB = onto.upsert({ id: 'net-markets', type: ENTITY.ASSET, label: 'Global Market Network' });
  for (const mc of MARKET_CENTERS) {
    onto.upsert({ id: mc.id, type: ENTITY.LOCATION, label: mc.name, lon: mc.lon, lat: mc.lat,
      props: { exch: mc.exch, tz: mc.tz, viewType: 'market-center' } });
    onto.relate(mc.id, HUB.id, RELATION.PART_OF);
  }
  const relsFor = (id) => onto.neighbors(id).map((n) => ({ type: n.type, label: n.entity.label, id: n.entity.id }));

  // ---- marker layer groups on the globe ----
  markersGroup = new THREE.Group();
  earth.add(markersGroup);
  /** @type {Record<string, THREE.Group>} */
  const layerGroups = {};
  for (const def of LAYERS) {
    const g = new THREE.Group();
    layerGroups[def.id] = g;
    markersGroup.add(g);
  }
  // Search results aren't a toggle layer; give them their own marker group so
  // addMarkers('search', …) + the highlight/pick paths work uniformly.
  layerGroups.search = new THREE.Group();
  markersGroup.add(layerGroups.search);

  // Cached glow-dot sprite textures, keyed by color.
  const dotTex = new Map();
  function dotTexture(color) {
    if (dotTex.has(color)) return dotTex.get(color);
    const S = 64, cvs = document.createElement('canvas'); cvs.width = cvs.height = S;
    const ctx = cvs.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, color); g.addColorStop(0.35, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.45; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, 7); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.17, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.5; ctx.stroke();
    const tex = new THREE.CanvasTexture(cvs); tex.colorSpace = THREE.SRGBColorSpace;
    dotTex.set(color, tex);
    return tex;
  }
  function makeDot(color, size) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(color), transparent: true }));
    sp.scale.set(size, size, 1);
    return sp;
  }

  const clearLayer = (id) => { const g = layerGroups[id]; while (g && g.children.length) g.remove(g.children[0]); };

  /** @param {string} id @param {{lon,lat,color,size,r?:number}[]} items */
  function addMarkers(id, items) {
    clearLayer(id);
    const g = layerGroups[id];
    for (const it of items) {
      const sp = makeDot(it.color, it.size);
      sp.position.copy(lonLatToVec3(it.lon, it.lat, it.r ?? 1.03));
      sp.userData.id = it.id;
      sp.userData.baseScale = sp.scale.clone();
      sp.userData.pick = () => selection.select(it.id);
      g.add(sp);
    }
  }

  const rangeField = (lon, lat) =>
    lastFix ? { k: 'RANGE', v: fmtKm(haversineKm(lastFix.lon, lastFix.lat, lon, lat)) } : null;

  // ---- inspector ----
  const inspector = initInspector({
    panel: $('inspector'), body: $('insp-body'), closeBtn: $('insp-close'),
    onPickRelation: (id) => selection.select(id),
    onClose: () => selection.clear(),
  });

  // ---- the single selection sink: everything that selects publishes an entity
  //      id to the bus; this subscriber is the one place that reacts — it rebuilds
  //      the inspector card via viewFor() and, for anything with a position,
  //      focuses the globe on it and highlights its marker. ----
  let highlightedSprite = null;
  function highlightEntity(id) {
    if (highlightedSprite && highlightedSprite.userData.baseScale) {
      highlightedSprite.scale.copy(highlightedSprite.userData.baseScale);
    }
    highlightedSprite = null;
    for (const gid in layerGroups) {
      for (const sp of layerGroups[gid].children) {
        if (sp.userData && sp.userData.id === id && sp.userData.baseScale) {
          highlightedSprite = sp;
          sp.scale.set(sp.userData.baseScale.x * 1.7, sp.userData.baseScale.y * 1.7, 1);
          return;
        }
      }
    }
  }
  selection.subscribe((id) => {
    const v = id == null ? null : viewFor(id);
    if (!v) { inspector.hide(); highlightEntity(null); return; }
    inspector.show(v);
    const e = onto.get(id);
    if (e && e.lon != null && e.lat != null) {
      steerTo(e.lon, e.lat);
      highlightEntity(id);
    } else {
      highlightEntity(null);
    }
  });

  // ---- per-type inspector view builders (rebuild an InspectorView from an
  //      ontology entity) + viewFor() dispatcher. Every inspectable thing is
  //      upserted with a props.viewType tag before it is shown; viewFor(id) maps
  //      that tag to the matching builder. This is the single place the inspector
  //      card is constructed, shared by markers, the market feed, and (later) the
  //      selection bus + graph. ----
  function marketCenterView(e) {
    const p = e.props || {};
    const open = isMarketOpen(p.tz);
    return {
      type: 'Location · Market Center', title: e.label, subtitle: p.exch,
      fields: [
        { k: 'EXCHANGE', v: p.exch },
        { k: 'SESSION', v: open == null ? '—' : open ? 'OPEN' : 'CLOSED' },
        { k: 'TZ', v: p.tz },
        { k: 'LAT', v: e.lat.toFixed(3) }, { k: 'LON', v: e.lon.toFixed(3) },
        rangeField(e.lon, e.lat),
      ],
      relations: relsFor(e.id),
      actions: [
        { label: '＋ Watchlist', onClick: () => addWatch(e.label, e.lon, e.lat) },
        { label: 'Headlines', onClick: () => openNews(e.label) },
      ],
    };
  }
  function instrumentView(e) {
    const p = e.props || {};
    return {
      type: 'MarketInstrument', title: e.label, subtitle: `${p.symbol} · ${p.kind.toUpperCase()}`,
      fields: [
        { k: 'PRICE', v: fmtPrice(p.value) },
        { k: 'CHANGE', v: fmtPct(p.change) },
        { k: 'SOURCE', v: p.source },
        { k: 'STATUS', v: p.stale ? 'STALE' : 'FRESH' },
      ],
      relations: relsFor(e.id),
    };
  }
  function quakeView(e) {
    const p = e.props || {};
    return {
      type: 'Event · Seismic', title: `M ${p.mag.toFixed(1)}`, subtitle: p.place,
      fields: [
        { k: 'MAGNITUDE', v: p.mag.toFixed(1) }, { k: 'DEPTH', v: p.depthKm.toFixed(0) + ' km' },
        { k: 'WHEN', v: new Date(p.ts).toUTCString().slice(5, 22) + 'Z' },
        { k: 'SOURCE', v: p.source }, rangeField(e.lon, e.lat),
      ],
      relations: relsFor(e.id),
      actions: [{ label: 'Headlines', onClick: () => openNews(p.place.replace(/^\d+\s*km.*?of\s*/i, '')) }],
    };
  }
  function geoView(e) {
    const p = e.props || {};
    return {
      type: 'Event · Geopolitical (mock)', title: e.label, subtitle: p.category,
      fields: [{ k: 'INTENSITY', v: (p.weight * 100).toFixed(0) + '%' }, rangeField(e.lon, e.lat)],
      relations: [],
      actions: [{ label: 'Headlines', onClick: () => openNews(e.label) }],
    };
  }
  function weatherView(e) {
    const p = e.props || {};
    return {
      type: 'Observation · Weather', title: e.label, subtitle: p.summary,
      fields: [
        { k: 'TEMP', v: p.tempC != null ? p.tempC.toFixed(1) + ' °C' : '—' },
        { k: 'WIND', v: p.windKmh != null ? p.windKmh.toFixed(0) + ' km/h' : '—' },
        { k: 'SOURCE', v: p.source },
      ],
      relations: relsFor(e.id),
    };
  }
  function watchlistView(e) {
    const p = e.props || {};
    return {
      type: 'Location · Watchlist', title: e.label,
      fields: [
        { k: 'LAT', v: e.lat.toFixed(4) }, { k: 'LON', v: e.lon.toFixed(4) },
        { k: 'ADDED', v: new Date(p.addedAt).toLocaleString() }, rangeField(e.lon, e.lat),
      ],
      actions: [{ label: '✕ Remove', kind: 'danger', onClick: () => removeWatch(e.id) }],
    };
  }
  function riskView(e) {
    const p = e.props || {};
    return {
      type: 'Risk Zone (mock)', title: e.label,
      fields: [{ k: 'INDEX', v: (p.weight * 100).toFixed(0) }, rangeField(e.lon, e.lat)],
    };
  }
  function assetView(e) {
    const p = e.props || {};
    return {
      type: 'Asset · ' + (p.facetLabel || 'OSM'), title: e.label, subtitle: p.kind || undefined,
      fields: [
        { k: 'CATEGORY', v: p.facetLabel },
        { k: 'LAT', v: e.lat.toFixed(4) }, { k: 'LON', v: e.lon.toFixed(4) },
        p.osmId ? { k: 'OSM', v: `${p.osmType}/${p.osmId}` } : null,
        rangeField(e.lon, e.lat),
      ],
      relations: relsFor(e.id),
      actions: [
        { label: '＋ Watchlist', onClick: () => addWatch(e.label, e.lon, e.lat) },
        { label: 'Headlines', onClick: () => openNews(e.label) },
      ],
    };
  }
  function satelliteView(e) {
    const p = e.props || {};
    return {
      type: 'Satellite · ' + (p.mock ? 'SIM ORBIT' : 'ON ORBIT'), title: e.label,
      subtitle: p.norad ? 'NORAD ' + p.norad : undefined,
      fields: [
        { k: 'ALT', v: p.altKm != null ? p.altKm.toFixed(0) + ' km' : '--' },
        { k: 'LAT', v: e.lat.toFixed(3) }, { k: 'LON', v: e.lon.toFixed(3) },
        { k: 'SOURCE', v: p.source || (p.mock ? 'Mock Orbits' : 'CelesTrak') },
        rangeField(e.lon, e.lat),
      ],
      relations: relsFor(e.id),
    };
  }
  function flightView(e) {
    const p = e.props || {};
    return {
      type: 'Aircraft · ' + (p.mock ? 'SIM ADS-B' : (p.onGround ? 'ON GROUND' : 'AIRBORNE')),
      title: e.label, subtitle: p.country || undefined,
      fields: [
        { k: 'ALT', v: p.altKm != null ? p.altKm.toFixed(1) + ' km' : '--' },
        { k: 'GND SPD', v: p.velocity != null ? (p.velocity * 3.6).toFixed(0) + ' km/h' : '--' },
        { k: 'HEADING', v: p.heading != null ? p.heading.toFixed(0) + '°' : '--' },
        { k: 'LAT', v: e.lat.toFixed(3) }, { k: 'LON', v: e.lon.toFixed(3) },
        { k: 'SOURCE', v: p.source || 'OpenSky' },
        rangeField(e.lon, e.lat),
      ],
      relations: relsFor(e.id),
    };
  }
  function vesselView(e) {
    const p = e.props || {};
    return {
      type: 'Vessel · ' + (p.mock ? 'SIM AIS' : 'AIS'), title: e.label,
      subtitle: p.kind || undefined,
      fields: [
        { k: 'TYPE', v: p.kind || '--' },
        { k: 'COURSE', v: p.course != null ? p.course.toFixed(0) + '°' : '--' },
        { k: 'SPEED', v: p.speedKn != null ? p.speedKn.toFixed(1) + ' kn' : '--' },
        { k: 'LAT', v: e.lat.toFixed(3) }, { k: 'LON', v: e.lon.toFixed(3) },
        { k: 'SOURCE', v: p.source || 'Mock AIS' },
        rangeField(e.lon, e.lat),
      ],
      relations: relsFor(e.id),
    };
  }
  function genericView(e) {
    return { type: e.type, title: e.label, relations: relsFor(e.id) };
  }

  /** Rebuild the InspectorView for an entity id from the ontology. */
  function viewFor(id) {
    const e = onto.get(id);
    if (!e) return null;
    switch (e.props && e.props.viewType) {
      case 'market-center': return marketCenterView(e);
      case 'instrument':    return instrumentView(e);
      case 'quake':         return quakeView(e);
      case 'geo':           return geoView(e);
      case 'weather':       return weatherView(e);
      case 'watchlist':     return watchlistView(e);
      case 'risk':          return riskView(e);
      case 'asset':         return assetView(e);
      case 'satellite':     return satelliteView(e);
      case 'flight':        return flightView(e);
      case 'vessel':        return vesselView(e);
      default:              return genericView(e);
    }
  }

  // Stamp the latest quote onto its instrument entity (kept fresh on every market
  // refresh and right before a feed-card selection so the view matches the quote).
  function upsertInstrument(q) {
    onto.upsert({ id: 'mi-' + q.symbol, type: ENTITY.MARKET_INSTRUMENT, label: q.label,
      props: { viewType: 'instrument', symbol: q.symbol, kind: q.kind,
        value: q.value, change: q.change, source: q.source, stale: q.stale } });
    onto.relate('mi-' + q.symbol, HUB.id, RELATION.RELATED_TO);
  }

  function selectInstrument(q) {
    upsertInstrument(q);
    selection.select('mi-' + q.symbol);
  }

  // ---- market feed (always on, independent of map layers) ----
  const market = initMarketFeed({ host: $('market-body'), onSelect: selectInstrument });
  /** @type {import('./js/data/providers/types.js').Quote[]} */
  let lastQuotes = [];
  let marketMock = false;

  function updateOntologyInstruments(quotes) {
    for (const q of quotes) upsertInstrument(q);
  }
  function updateTicker(quotes) {
    const pick = ['BTC', 'ETH', 'EURUSD', 'SPX', 'XAU'];
    const items = pick.map((s) => quotes.find((q) => q.symbol === s)).filter(Boolean).map((q) => ({
      label: q.label, value: fmtPrice(q.value), change: fmtPct(q.change), sign: signClass(q.change),
    }));
    shell.setTicker(items);
  }
  async function refreshMarket() {
    const res = await getMarketQuotes();
    lastQuotes = res.data; marketMock = res.mock;
    updateOntologyInstruments(lastQuotes);
    market.render(lastQuotes, { mock: res.mock });
    updateTicker(lastQuotes);
    const tag = $('market-tag'); if (tag) { tag.textContent = res.mock ? 'MOCK' : 'LIVE'; tag.className = 'ph-tag' + (res.mock ? ' warn' : ' ok'); }
  }

  // ---- layer renderers ----
  function renderMarketCenters() {
    addMarkers('markets', MARKET_CENTERS.map((mc) => ({
      lon: mc.lon, lat: mc.lat, color: '#45e0b0', size: 0.052,
      id: mc.id,
    })));
  }

  let lastQuakes = [];
  let quakeTimer = null;
  async function refreshQuakes() {
    const res = await getQuakes();
    lastQuakes = res.data;
    onto.upsert({ id: 'src-usgs', type: ENTITY.FEED_SOURCE, label: res.mock ? 'Mock Seismic' : 'USGS' });
    for (const q of lastQuakes) {
      onto.upsert({ id: 'eq-' + q.id, type: ENTITY.EVENT, label: `M ${q.mag.toFixed(1)} · ${q.place}`,
        lon: q.lon, lat: q.lat,
        props: { viewType: 'quake', mag: q.mag, place: q.place, depthKm: q.depthKm, ts: q.ts, source: q.source } });
      onto.relate('eq-' + q.id, 'src-usgs', RELATION.OBSERVED_FROM);
    }
    if (layers.isOn('earthquakes')) {
      addMarkers('earthquakes', lastQuakes.map((q) => ({
        lon: q.lon, lat: q.lat, color: '#ff8a5a', size: 0.03 + Math.min(0.06, q.mag * 0.009),
        id: 'eq-' + q.id,
      })));
    }
    checkNearMe();
    setStatus(`SEISMIC FEED · ${lastQuakes.length} EVENTS · ${res.mock ? 'MOCK' : 'USGS'}`);
  }
  const startQuakeTimer = () => { stopQuakeTimer(); quakeTimer = setInterval(refreshQuakes, 120000); };
  const stopQuakeTimer = () => { if (quakeTimer) { clearInterval(quakeTimer); quakeTimer = null; } };

  async function refreshWeather() {
    const pts = MARKET_CENTERS.map((mc) => ({ id: mc.id, name: mc.name, lon: mc.lon, lat: mc.lat }));
    if (prefs.ownWeather && lastFix) pts.push({ id: 'me', name: 'My Location', lon: lastFix.lon, lat: lastFix.lat });
    const results = await Promise.all(pts.map(async (p) => {
      const r = await getWeather(p.lon, p.lat); return { p, w: r.data[0] };
    }));
    if (!layers.isOn('weather')) return;
    addMarkers('weather', results.map(({ p, w }) => {
      const id = 'wx-' + p.id;
      const srcId = 'src-' + String(w.source).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      onto.upsert({ id: srcId, type: ENTITY.FEED_SOURCE, label: w.source });
      onto.upsert({ id, type: ENTITY.OBSERVATION, label: p.name, lon: p.lon, lat: p.lat,
        props: { viewType: 'weather', summary: w.summary, tempC: w.tempC, windKmh: w.windKmh, source: w.source } });
      onto.relate(id, srcId, RELATION.OBSERVED_FROM);
      return { lon: p.lon, lat: p.lat, color: '#7ec8ff', size: 0.04, id };
    }));
  }

  function renderGeo() {
    addMarkers('geopolitical', mockGeopolitical().map((e) => {
      const id = 'geo-' + e.id;
      onto.upsert({ id, type: ENTITY.EVENT, label: e.label, lon: e.lon, lat: e.lat,
        props: { viewType: 'geo', category: e.meta.category, weight: e.weight } });
      return { lon: e.lon, lat: e.lat, color: '#c08bff', size: 0.04, id };
    }));
  }
  function renderRisk() {
    addMarkers('risk', mockRisk().map((r) => {
      const id = 'risk-' + r.id;
      onto.upsert({ id, type: ENTITY.ALERT, label: r.label, lon: r.lon, lat: r.lat,
        props: { viewType: 'risk', weight: r.weight } });
      return { lon: r.lon, lat: r.lat, color: '#ff5a52', size: 0.045 + r.weight * 0.04, id };
    }));
  }

  // ---- tracking feeds: satellites / aircraft / vessels ----------------------
  // Civilian situational-awareness only. Each feed degrades to honest MOCK data
  // on any fetch/CORS/rate-limit failure; live but aged readings flag STALE. The
  // Tracking workspace mirrors LAYERS state and shows per-feed counts + badges.
  let creds = lsLoad('creds', {});   // {clientId,clientSecret,aisKey} — local-only

  // Satellites: TLEs are fetched once (cached), then re-propagated on a timer so
  // the dots actually move; we never refetch elements while the layer is on.
  let satSet = null, satTimer = null;
  function satRadius(altKm) { return 1.08 + Math.min(0.5, (altKm || 0) / 6371); }
  function drawSatellites() {
    if (!satSet || !layers.isOn('satellites')) return;
    const pts = propagateSats(satSet, new Date());
    addMarkers('satellites', pts.map((s) => {
      const id = 'sat-' + s.id;
      onto.upsert({ id, type: ENTITY.ASSET, label: s.name, lon: s.lon, lat: s.lat,
        props: { viewType: 'satellite', altKm: s.altKm, mock: satSet.mock,
          source: satSet.source, norad: (s.id.match(/^sat-(\d+)/) || [])[1] } });
      return { lon: s.lon, lat: s.lat, color: '#9fe8ff', size: 0.026, r: satRadius(s.altKm), id };
    }));
    highlightEntity(selection.current());   // keep any selection highlighted across redraws
    tracking?.setStatus('satellites', { count: pts.length, mock: satSet.mock, source: satSet.source });
  }
  async function refreshSatellites() {
    if (!layers.isOn('satellites')) return;
    tracking?.setStatus('satellites', { busy: true });
    if (!satSet) {
      onto.upsert({ id: 'src-celestrak', type: ENTITY.FEED_SOURCE, label: 'CelesTrak' });
      satSet = await fetchSatellites();
    }
    drawSatellites();
    setStatus(`ORBITAL TRACK · ${(satSet.sats || []).length} OBJECTS · ${satSet.mock ? 'MOCK' : 'CelesTrak/SGP4'}`);
  }
  const startSatTimer = () => { stopSatTimer(); satTimer = setInterval(drawSatellites, 5000); };
  const stopSatTimer = () => { if (satTimer) { clearInterval(satTimer); satTimer = null; } };

  // Aircraft: anonymous OpenSky bbox query on a polite cadence (optional runtime
  // OAuth2 creds raise the limit); HTTP 429 / any error → honest mock ADS-B.
  let flightTimer = null;
  async function refreshFlights() {
    if (!layers.isOn('flights')) return;
    tracking?.setStatus('flights', { busy: true });
    onto.upsert({ id: 'src-opensky', type: ENTITY.FEED_SOURCE, label: 'OpenSky Network' });
    const res = await fetchFlights(currentViewBBox(0.5), creds);
    if (!layers.isOn('flights')) return;
    addMarkers('flights', res.data.map((f) => {
      const id = 'flt-' + f.id;
      onto.upsert({ id, type: ENTITY.ASSET, label: f.callsign, lon: f.lon, lat: f.lat,
        props: { viewType: 'flight', country: f.country, altKm: f.altKm, velocity: f.velocity,
          heading: f.heading, onGround: f.onGround, mock: res.mock, source: res.source } });
      onto.relate(id, 'src-opensky', RELATION.OBSERVED_FROM);
      return { lon: f.lon, lat: f.lat, color: '#ffd166', size: 0.03, r: 1.05, id };
    }));
    highlightEntity(selection.current());
    tracking?.setStatus('flights', { count: res.data.length, mock: res.mock, source: res.source });
    setStatus(`AIR TRACK · ${res.data.length} CONTACTS · ${res.mock ? 'MOCK' : 'OpenSky'}`);
  }
  const startFlightTimer = () => { stopFlightTimer(); flightTimer = setInterval(refreshFlights, 30000); };
  const stopFlightTimer = () => { if (flightTimer) { clearInterval(flightTimer); flightTimer = null; } };

  // Vessels: real AIS via AISStream (WebSocket) when an AIS key is set — a PUSH
  // stream, so reports accumulate in a rolling map and markers redraw on a 1.5s
  // throttle; contacts silent >10 min are pruned. With no key (or if the key is
  // rejected) we fall back to honest mock on a 45s poll.
  let vesselTimer = null, vesselStream = null, vesselDrawTimer = null;
  const vesselReports = new Map();   // entity-id -> latest report
  function drawVessels(mock, source) {
    if (!layers.isOn('vessels')) return;
    const cut = Date.now() - 600000;
    for (const [id, v] of vesselReports) if (v.t < cut) vesselReports.delete(id);
    const list = [...vesselReports.values()].slice(0, 300);
    onto.upsert({ id: 'src-ais', type: ENTITY.FEED_SOURCE, label: 'AIS' });
    addMarkers('vessels', list.map((v) => {
      onto.upsert({ id: v.id, type: ENTITY.ASSET, label: v.name, lon: v.lon, lat: v.lat,
        props: { viewType: 'vessel', kind: v.kind, course: v.course, speedKn: v.speedKn,
          mock, source } });
      onto.relate(v.id, 'src-ais', RELATION.OBSERVED_FROM);
      return { lon: v.lon, lat: v.lat, color: '#7ec8ff', size: 0.032, r: 1.04, id: v.id };
    }));
    highlightEntity(selection.current());
    tracking?.setStatus('vessels', { count: list.length, mock, source });
  }
  const scheduleVesselDraw = (mock, source) => {
    if (vesselDrawTimer) return;
    vesselDrawTimer = setTimeout(() => { vesselDrawTimer = null; drawVessels(mock, source); }, 1500);
  };
  async function fillVesselsMock(source) {
    stopVesselTimer();
    const res = await fetchVessels(currentViewBBox(0.5), creds.aisKey);
    if (!layers.isOn('vessels')) return;
    vesselReports.clear();
    for (const v of res.data) {
      vesselReports.set(v.id, { id: v.id, name: v.name, kind: v.type,
        lon: v.lon, lat: v.lat, course: v.course, speedKn: v.speedKn, t: Date.now() });
    }
    drawVessels(true, source || res.source);
    setStatus(`SEA TRACK · ${res.data.length} VESSELS · MOCK`);
    vesselTimer = setInterval(() => fillVesselsMock(source), 45000);
  }
  function refreshVessels() {
    if (!layers.isOn('vessels')) return;
    if (creds.aisKey) {
      // (Re)open the AIS stream for the current view.
      closeVesselStream(); stopVesselTimer(); vesselReports.clear();
      tracking?.setStatus('vessels', { busy: true });
      setStatus('SEA TRACK · CONNECTING TO AISSTREAM…');
      vesselStream = streamVessels({
        bbox: currentViewBBox(0.5), key: creds.aisKey,
        onReport: (r) => {
          if (!layers.isOn('vessels')) return;
          vesselReports.set(r.id, { id: r.id, name: r.name, kind: r.kind,
            lon: r.lon, lat: r.lat, course: r.course, speedKn: r.speedKn, t: r.t });
          scheduleVesselDraw(false, 'AISStream');
        },
        onStatus: (s) => {
          if (s.error) {
            setStatus(`SEA TRACK · AISSTREAM ${s.message ? '· ' + s.message.toUpperCase() : 'ERROR'} · MOCK FALLBACK`);
            closeVesselStream();
            if (layers.isOn('vessels')) fillVesselsMock('AIS rejected · mock');
          } else if (s.open) {
            setStatus('SEA TRACK · AISSTREAM LIVE');
          }
        },
      });
    } else {
      closeVesselStream();
      fillVesselsMock();
    }
  }
  function closeVesselStream() {
    if (vesselStream) { vesselStream.close(); vesselStream = null; }
    if (vesselDrawTimer) { clearTimeout(vesselDrawTimer); vesselDrawTimer = null; }
  }
  const stopVesselTimer = () => { if (vesselTimer) { clearInterval(vesselTimer); vesselTimer = null; } };

  // ---- watchlist ----
  function saveWatch() { lsSave('watchlist', watchlist); }
  function renderWatchlist() {
    if (!layers.isOn('watchlist')) { clearLayer('watchlist'); return; }
    addMarkers('watchlist', watchlist.map((w) => {
      onto.upsert({ id: w.id, type: ENTITY.LOCATION, label: w.name, lon: w.lon, lat: w.lat,
        props: { viewType: 'watchlist', addedAt: w.addedAt } });
      return { lon: w.lon, lat: w.lat, color: '#ffd166', size: 0.05, id: w.id };
    }));
  }
  function addWatch(name, lon, lat) {
    const id = 'wl_' + Date.now().toString(36);
    watchlist.push({ id, name: name || `Waypoint ${watchlist.length + 1}`, lon, lat, addedAt: Date.now() });
    saveWatch();
    if (!layers.isOn('watchlist')) layers.setOn('watchlist', true); else renderWatchlist();
    setStatus(`ADDED TO WATCHLIST · ${name}`);
  }
  function addWatchFromFix() {
    if (!lastFix) { setStatus('NO FIX YET · CANNOT ADD WATCHLIST POINT'); return; }
    addWatch(`Waypoint ${watchlist.length + 1}`, lastFix.lon, lastFix.lat);
  }
  function removeWatch(id) {
    watchlist = watchlist.filter((w) => w.id !== id);
    saveWatch(); renderWatchlist(); selection.clear();
    setStatus('WATCHLIST POINT REMOVED');
  }

  // ---- breadcrumb trail ----
  function renderTrail() {
    clearLayer('trail');
    if (!layers.isOn('trail') || trail.length < 2) return;
    const pts = trail.map((p) => lonLatToVec3(p.lon, p.lat, 1.02));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x45e0b0, transparent: true, opacity: 0.85 })
    );
    layerGroups.trail.add(line);
  }
  let trailSaveT = 0;
  function pushTrail(lon, lat) {
    const last = trail[trail.length - 1];
    if (last && haversineKm(last.lon, last.lat, lon, lat) < 0.02) return; // dedupe tiny jitter
    trail.push({ lon, lat, t: Date.now() });
    if (trail.length > 250) trail.shift();
    if (Date.now() - trailSaveT > 5000) { lsSave('trail', trail); trailSaveT = Date.now(); }
    renderTrail();
  }
  function clearTrail() { trail = []; lsSave('trail', trail); renderTrail(); setStatus('MOVEMENT TRAIL CLEARED'); }

  // ---- alerts (lightweight; surfaced in the status line) ----
  let nearAlertKey = '';
  function checkNearMe() {
    if (!lastFix || !lastQuakes.length) return;
    let nearest = null, nd = Infinity;
    for (const q of lastQuakes) {
      const d = haversineKm(lastFix.lon, lastFix.lat, q.lon, q.lat);
      if (d < nd) { nd = d; nearest = q; }
    }
    if (nearest && nd < 800) {
      const key = nearest.id;
      if (key !== nearAlertKey) {
        nearAlertKey = key;
        setStatus(`⚠ ALERT · M${nearest.mag.toFixed(1)} SEISMIC EVENT ${fmtKm(nd)} AWAY · ${nearest.place}`);
      }
    }
  }

  let ownWeatherT = 0;
  positionListeners.push((lon, lat, alt, extra) => {
    pushTrail(lon, lat);
    if (extra && extra.accuracy != null && extra.accuracy > 150) {
      setStatus(`⚠ POSITION ACCURACY DEGRADED · ±${extra.accuracy.toFixed(0)} m`);
    }
    checkNearMe();
    if (prefs.ownWeather && layers.isOn('weather') && Date.now() - ownWeatherT > 300000) {
      ownWeatherT = Date.now(); refreshWeather();
    }
  });

  // ---- layer toggle dispatch ----
  function onLayerToggle(id, enabled) {
    lsSave('layers', layers.getState());
    if (id === 'graph') { graph.setVisible(enabled); return; }   // panel, not a marker layer
    if (id === 'satellites' || id === 'flights' || id === 'vessels') tracking?.reflect(id);
    if (!enabled) {
      clearLayer(id);
      if (id === 'earthquakes') stopQuakeTimer();
      if (id === 'satellites') stopSatTimer();
      if (id === 'flights') stopFlightTimer();
      if (id === 'vessels') { stopVesselTimer(); closeVesselStream(); vesselReports.clear(); }
      return;
    }
    switch (id) {
      case 'markets': renderMarketCenters(); break;
      case 'watchlist': renderWatchlist(); break;
      case 'geopolitical': renderGeo(); break;
      case 'risk': renderRisk(); break;
      case 'trail': renderTrail(); break;
      case 'earthquakes': refreshQuakes(); startQuakeTimer(); break;
      case 'weather': refreshWeather(); break;
      case 'satellites': refreshSatellites(); startSatTimer(); break;
      case 'flights': refreshFlights(); startFlightTimer(); break;
      case 'vessels': refreshVessels(); break;
    }
  }

  // ---- link-analysis graph (toggled via the 'graph' layer; close syncs the rail) ----
  const graph = initGraph({
    panel: $('graph-panel'), host: $('graph-host'), expandBtn: $('graph-expand'),
    onto, selection,
  });
  $('graph-close')?.addEventListener('click', () => layers.setOn('graph', false));

  const layers = initLayers({ host: $('layer-list'), initial: lsLoad('layers', {}), onToggle: onLayerToggle });

  // ---- shell (privacy + ticker) ----
  const shell = initShell({
    privacyState: $('privacy-state'), weatherOptIn: $('opt-weather'), clearBtn: $('clear-data'),
    ticker: $('sb-ticker'), ownWeatherInitial: prefs.ownWeather,
    onOwnWeatherChange: (v) => {
      prefs.ownWeather = v; savePrefs();
      if (layers.isOn('weather')) refreshWeather();
      setStatus(v ? 'WEATHER WILL INCLUDE YOUR LOCATION' : 'WEATHER USES SAMPLE POINTS ONLY');
    },
    onClearData: () => {
      lsClear(); watchlist = []; trail = [];
      renderWatchlist(); renderTrail();
      setStatus('LOCAL DATA CLEARED · WATCHLIST + TRAIL WIPED');
    },
  });

  // ---- nav rail: one swappable workspace container (Layers / Feeds / …) ----
  // Owns only which workspace is visible; the panels' content (layer toggles,
  // market feed) is still wired by their own modules above.
  const navrail = initNavRail({
    nav: $('navrail'), workspace: $('workspace'), initial: 'layers',
    onChange: (id) => setStatus('WORKSPACE · ' + id.toUpperCase()),
  });

  // ---- command palette ----
  const styleKeys = ['daynight', 'political', 'radar', 'threat'];
  function cycleStyle() {
    const i = styleKeys.indexOf(currentStyle);
    applyStyle(styleKeys[(i + 1) % styleKeys.length]);
    setStatus('MAP STYLE · ' + currentStyle.toUpperCase());
  }
  const onoff = (id) => (layers.isOn(id) ? 'on' : 'off');
  function getCommands() {
    const cmds = [
      { id: 'locate', title: 'Go to my location', hint: lastFix ? '' : 'no fix', group: 'map', run: () => $('goto-loc')?.click() },
      { id: 'style', title: 'Switch map style', hint: currentStyle, group: 'map', run: cycleStyle },
      { id: 'addwl', title: 'Add current location to watchlist', group: 'watchlist', run: addWatchFromFix },
      { id: 'cleartrail', title: 'Clear movement trail', hint: trail.length + ' pts', group: 'watchlist', run: clearTrail },
      { id: 'market', title: 'Open market feed', group: 'view', run: openMarketPanel },
      { id: 'graph', title: 'Toggle entity graph', hint: onoff('graph'), group: 'view', run: () => layers.toggle('graph') },
      { id: 'street', title: 'Toggle street level', group: 'map', run: () => $('street-toggle')?.click() },
      { id: 'cleardata', title: 'Clear all local data', hint: 'watchlist+trail', group: 'privacy', run: () => $('clear-data')?.click() },
    ];
    for (const def of LAYERS) {
      cmds.push({ id: 'ly-' + def.id, title: `Toggle ${def.label.toLowerCase()} layer`, hint: onoff(def.id), group: 'layers', run: () => layers.toggle(def.id) });
    }
    return cmds;
  }
  const palette = initCommandPalette({ root: $('cmdk'), input: $('cmdk-input'), list: $('cmdk-list'), getCommands });
  $('cmd-open')?.addEventListener('click', () => palette.open());

  // ---- mobile: relocate the nav rail + workspace into the bottom tray ----
  const mqMobile = window.matchMedia('(max-width: 760px)');
  function placeRails() {
    const tb = $('tray-body');
    if (!tb) return;
    if (mqMobile.matches) { tb.appendChild($('navrail')); tb.appendChild($('workspace')); }
    else { document.body.appendChild($('navrail')); document.body.appendChild($('workspace')); }
  }
  function openMarketPanel() {
    navrail.show('feeds');                    // switch the workspace to the market feed
    if (mqMobile.matches) {
      document.body.classList.add('tray-open');
      $('tray-toggle')?.setAttribute('aria-expanded', 'true');
      $('workspace')?.scrollIntoView({ block: 'nearest' });
    }
    setStatus('MARKET FEED · ' + (marketMock ? 'MOCK DATA' : 'LIVE'));
  }
  mqMobile.addEventListener('change', placeRails);
  placeRails();

  // ---- faceted asset search (OSM Overpass; mock fallback) ----
  // bbox of the area currently in view: the street-map bounds when zoomed in,
  // else a modest box around the GPS fix (or the sub-camera point on the globe).
  function currentViewBBox(half = 0.18) {
    if (streetActive && smap) {
      const b = smap.getBounds();
      return [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
    }
    const c = lastFix ? { lon: lastFix.lon, lat: lastFix.lat } : vec3ToLonLat(camera.position);
    const dLon = half / Math.max(0.2, Math.cos(c.lat * Math.PI / 180));
    return [c.lat - half, c.lon - dLon, c.lat + half, c.lon + dLon];
  }
  const search = initSearch({
    input: $('search-input'), facetHost: $('search-facets'), runBtn: $('search-run'),
    results: $('search-results'), statusEl: $('search-status'),
    onRun: async (facetIds) => {
      search.setBusy(true);
      setStatus('ASSET SEARCH · QUERYING OVERPASS…');
      const res = await searchAssets(currentViewBBox(), facetIds);
      search.setResults(res.data, { mock: res.mock, source: res.source });
      setStatus(`ASSET SEARCH · ${res.data.length} HITS · ${res.mock ? 'MOCK' : 'OSM'}`);
    },
    // Visible set changed → upsert as Asset entities + redraw the search markers.
    onResults: (items) => {
      addMarkers('search', items.map((it) => {
        const id = 'as-' + it.id;
        onto.upsert({ id, type: ENTITY.ASSET, label: it.label, lon: it.lon, lat: it.lat,
          props: { viewType: 'asset', facet: it.facet, facetLabel: it.facetLabel,
            kind: it.kind, osmType: it.osmType, osmId: it.osmId } });
        return { lon: it.lon, lat: it.lat, color: it.color, size: 0.035, id };
      }));
    },
    onSelect: (id) => selection.select('as-' + id),
  });

  // ---- tracking workspace (sat / air / sea) -----------------------------------
  let auth = null;   // set below; null until initAuth resolves (or stays a stub)
  let wasSignedIn = false;   // tracks a real sign-in→out transition (vs the initial no-session)
  const tracking = initTracking({
    host: $('track-feeds'), refreshBtn: $('track-refresh'),
    creds: {
      idInput: $('track-osky-id'), secretInput: $('track-osky-secret'), aisInput: $('track-ais-key'),
      saveBtn: $('track-creds-save'), clearBtn: $('track-creds-clear'), note: $('track-creds-note'),
    },
    initialCreds: creds,
    isOn: (feed) => layers.isOn(feed),
    onToggle: (feed, on) => layers.setOn(feed, on),
    onRefresh: () => {
      if (layers.isOn('satellites')) refreshSatellites();
      if (layers.isOn('flights')) refreshFlights();
      if (layers.isOn('vessels')) refreshVessels();
      setStatus('TRACKING · REFRESHED IN-VIEW');
    },
    onSaveCreds: (next) => {
      creds = next; lsSave('creds', creds);
      if (layers.isOn('flights')) refreshFlights();   // re-auth on next pull
      if (layers.isOn('vessels')) refreshVessels();   // key set → switch to live AIS stream
      const synced = !!auth?.user?.();
      if (synced) auth.saveSecrets(creds);            // push to the user's RLS-protected row
      setStatus('TRACKING CREDENTIALS UPDATED · ' + (synced ? 'CLOUD SYNCED' : 'LOCAL ONLY'));
    },
  });

  // ---- account / cloud sync (optional Supabase — no-op when unconfigured) ------
  const account = initAccount({
    host: $('track-account'),
    onSignIn: () => auth?.signIn(),
    onSignOut: () => auth?.signOut(),
  });
  account.render(null, authConfigured);   // paint immediately; auth refines on load

  // Pull the signed-in user's stored keys and merge them over the local set.
  async function applyRemoteSecrets(api) {
    if (!api?.user?.()) return;
    const remote = await api.loadSecrets();
    if (remote && Object.keys(remote).length) {
      creds = { ...creds, ...remote };
      lsSave('creds', creds);
      tracking.setCreds(creds);
      if (layers.isOn('flights')) refreshFlights();
      if (layers.isOn('vessels')) refreshVessels();
      setStatus('TRACKING KEYS LOADED FROM CLOUD');
    }
  }

  initAuth({
    // Fires on initial session and every sign-in/out. `auth` may be unset on the
    // very first (synchronous) call, so the initial load is also done in .then().
    onChange: (user) => {
      account.render(user, authConfigured);
      if (user) {
        wasSignedIn = true;
        if (auth) applyRemoteSecrets(auth);
      } else if (wasSignedIn) {
        // Genuine sign-out (not the initial no-session): purge the cloud-loaded
        // keys from this device so the next person on a shared browser can't see
        // them. A local-only user who never signed in is untouched (wasSignedIn
        // stays false on the initial onChange(null)).
        wasSignedIn = false;
        creds = {};
        lsSave('creds', creds);
        tracking.setCreds(creds);                       // blanks the credential inputs
        if (layers.isOn('flights')) refreshFlights();   // stop using the cleared key
        if (layers.isOn('vessels')) refreshVessels();
        setStatus('SIGNED OUT · CLOUD KEYS CLEARED FROM THIS DEVICE');
      }
    },
  }).then((a) => { auth = a; applyRemoteSecrets(a); });

  // ---- kick off ----
  market.setLoading();
  refreshMarket();
  setInterval(refreshMarket, 90000);
  setInterval(() => { if (lastQuotes.length) { markStale(lastQuotes); market.render(lastQuotes, { mock: marketMock }); updateTicker(lastQuotes); } }, 20000);
  layers.emitEnabled();   // paint whichever layers start enabled (markets + watchlist by default)
})();
