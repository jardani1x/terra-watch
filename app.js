import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as topojson from 'https://esm.sh/topojson-client@3';

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

// ------------------------------------------------------------
//  Coordinate helpers
// ------------------------------------------------------------
function lonLatToVec3(lon, lat, r = 1) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

function toDMS(value, [pos, neg]) {
  const hemi = value >= 0 ? pos : neg;
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = ((mFloat - m) * 60).toFixed(1);
  return `${d}°${String(m).padStart(2, '0')}'${String(s).padStart(4, '0')}"${hemi}`;
}

// Grid Zone Designator (UTM zone number + MGRS latitude band).
function gridZone(lat, lon) {
  const zone = Math.floor((lon + 180) / 6) + 1;
  const bands = 'CDEFGHJKLMNPQRSTUVWX';
  let idx = Math.floor((lat + 80) / 8);
  idx = Math.max(0, Math.min(bands.length - 1, idx));
  return `${String(zone).padStart(2, '0')}${bands[idx]}`;
}

const CARDINALS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const cardinal = (deg) => CARDINALS[Math.round(((deg % 360) / 22.5)) % 16];

// Equirectangular canvas helpers (shared by the day/night texture builders).
// px = (lon+180)/360·W, py = (90-lat)/180·H matches SphereGeometry UVs.
const polysOf = (gm) =>
  gm.type === 'Polygon' ? [gm.coordinates]
  : gm.type === 'MultiPolygon' ? gm.coordinates
  : [];
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
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.7;
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
  document.querySelectorAll('#style-switch .ss-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.style === name);
  });
}

function setupStyleSwitch() {
  document.querySelectorAll('#style-switch .ss-btn').forEach((b) => {
    b.addEventListener('click', () => applyStyle(b.dataset.style));
  });
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
    smap.setView([lastFix.lat, lastFix.lon], Math.max(smap.getZoom(), 16), { animate: true });
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
//  full-viewport satellite tile map that goes down to street level (z19) and
//  keeps tracking the live GPS fix. Zooming back out past the keyzoom (or the
//  "BACK TO GLOBE" button) returns to the globe. Leaflet is loaded as a classic
//  script in index.html (global `L`); the map is built lazily on first handoff.
// ============================================================
const KEYZOOM = 10;                                // globe → tiles handoff level (globe owns Z02–Z10)
const STREET_MAX = 22;                             // satellite zoom cap (over-zooms past native 19)
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
  // so streets stay legible over the aerial photography. Both keyless.
  window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: STREET_MAX, maxNativeZoom: 19,
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  }).addTo(smap);
  window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: STREET_MAX, maxNativeZoom: 19, opacity: 0.9,
  }).addTo(smap);

  smapAcc = window.L.circle([lat, lon], { radius: 0, color: '#45e0b0', weight: 1, fillColor: '#45e0b0', fillOpacity: 0.12 }).addTo(smap);
  smapMarker = window.L.marker([lat, lon]).addTo(smap);

  smap.on('zoomend', () => { setZoomReadout(); if (smap.getZoom() < KEYZOOM) exitStreet(); });
  smap.on('dragstart', () => { streetFollow = false; });   // manual pan → stop tracking
}

// Hand off from the globe to the street map (lazily building it the first time).
function enterStreet(lon, lat, zoom = 16, follow = false) {
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
  if (lastFix) enterStreet(lastFix.lon, lastFix.lat, 16, true);
  else { const c = vec3ToLonLat(camera.position); enterStreet(c.lon, c.lat, 13, false); }
});
$('sm-exit')?.addEventListener('click', exitStreet);

// ============================================================
//  COUNTRY NEWS (click a country → lightbox of top-10 headlines)
//  Raycast the click onto the globe → lon/lat → point-in-polygon against the
//  loaded country features → fetch recent articles from GDELT (no API key).
// ============================================================

// Inverse of lonLatToVec3 (earth group is unrotated, so world == local).
function vec3ToLonLat(p) {
  const v = p.clone().normalize();
  const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(v.y, -1, 1)));
  let lon = THREE.MathUtils.radToDeg(Math.atan2(v.z, -v.x)) - 180;
  lon = ((lon + 540) % 360) - 180;
  return { lon, lat };
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function polyContains(poly, lon, lat) {       // poly[0] outer ring, rest are holes
  if (!pointInRing(lon, lat, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (pointInRing(lon, lat, poly[k])) return false;
  return true;
}
function countryAt(lon, lat) {
  if (!worldGeo) return null;
  for (const f of worldGeo.features) {
    const gm = f.geometry; if (!gm) continue;
    const polys = gm.type === 'Polygon' ? [gm.coordinates] : gm.type === 'MultiPolygon' ? gm.coordinates : [];
    for (const poly of polys) if (polyContains(poly, lon, lat)) return f.properties?.name || null;
  }
  return null;
}

// --- click vs. drag detection on the globe ---
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
  const hit = raycaster.intersectObject(globe, false)[0];
  if (!hit) return;
  const { lon, lat } = vec3ToLonLat(hit.point);
  const name = countryAt(lon, lat);
  if (name) openNews(name);
  else setStatus('NO COUNTRY UNDER CURSOR · OCEAN OR UNMAPPED');
});

// --- GDELT fetch + lightbox ---
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function renderNews(country, articles, state) {
  const lb = $('news-lb'); if (!lb) return;
  lb.removeAttribute('hidden');
  $('lb-country').textContent = country.toUpperCase();
  const body = $('lb-body');
  if (state === 'loading') { body.innerHTML = '<div class="lb-msg">ACQUIRING FEED…</div>'; return; }
  if (state === 'error')   { body.innerHTML = '<div class="lb-msg warn">FEED UNREACHABLE · GDELT REQUEST FAILED</div>'; return; }
  if (state === 'empty')   { body.innerHTML = '<div class="lb-msg warn">NO RECENT ARTICLES FOUND</div>'; return; }
  body.innerHTML = articles.map((a, i) => {
    const d = (a.seendate || '').replace(/^(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3');
    return `<a class="lb-item" href="${encodeURI(a.url || '#')}" target="_blank" rel="noopener noreferrer">
      <span class="lb-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="lb-text"><span class="lb-ttl">${escapeHtml(a.title || '(untitled)')}</span>
      <span class="lb-meta">${escapeHtml(a.domain || '')} · ${d}</span></span></a>`;
  }).join('');
}

// GDELT sends no CORS headers, so a direct browser fetch is blocked. Route the
// request through a chain of public CORS proxies, trying each until one returns
// usable JSON. `raw`/`quest` proxies pass the body through verbatim; the
// allorigins `get` wrapper nests it under `.contents` as a string.
const NEWS_PROXIES = [
  (u) => ({ url: `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` }),
  (u) => ({ url: `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}` }),
  (u) => ({ url: `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, wrapped: true }),
];

// Fetch the GDELT JSON via the proxy chain; returns the parsed object or throws
// if every proxy fails / yields unparseable data.
async function fetchNewsJSON(gdeltUrl) {
  let lastErr = null;
  for (const make of NEWS_PROXIES) {
    const { url, wrapped } = make(gdeltUrl);
    try {
      const res = await fetch(url);
      if (!res.ok) { lastErr = new Error('HTTP ' + res.status); continue; }
      let data = await res.json();
      if (wrapped) data = JSON.parse(data.contents);   // allorigins /get nests the body
      if (data && Array.isArray(data.articles)) return data;
      lastErr = new Error('no articles field');
    } catch (e) {
      lastErr = e;   // network/CORS/parse error — try the next proxy
    }
  }
  throw lastErr || new Error('all proxies failed');
}

async function openNews(country) {
  renderNews(country, null, 'loading');
  try {
    const q = encodeURIComponent(`"${country}" sourcelang:eng`);
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=ArtList&format=json&maxrecords=10&sortby=DateDesc&timespan=14d`;
    const data = await fetchNewsJSON(url);
    const articles = (data.articles || []).slice(0, 10);
    renderNews(country, articles, articles.length ? 'ok' : 'empty');
  } catch (e) {
    renderNews(country, null, 'error');
  }
}

function closeNews() { $('news-lb')?.setAttribute('hidden', ''); }
$('lb-close')?.addEventListener('click', closeNews);
$('lb-backdrop')?.addEventListener('click', closeNews);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNews(); });

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

function onPosition(lon, lat, alt, extra = {}, sim = false) {
  lastFix = { lon, lat };
  placeMarker(lon, lat);
  buildSignalArcs(lon, lat);
  if (!hasAutoFocused) { steerTo(lon, lat); hasAutoFocused = true; }
  else if (following) steerTo(lon, lat);   // track mode: keep it centred, hold zoom
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
    if (following && lastFix) enterStreet(lastFix.lon, lastFix.lat, 16, true);
    else { const c = vec3ToLonLat(camera.position); enterStreet(c.lon, c.lat, 16, false); }
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

  controls.update();

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
