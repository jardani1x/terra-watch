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
  // Used only if geolocation is denied/unavailable (flagged "SIM" in UI).
  fallback: { lat: 38.9072, lon: -77.0369, alt: 17, sim: true },
};

const ACCENT = new THREE.Color('#45e0b0');
const $ = (id) => document.getElementById(id);

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

// --- ocean sphere ---
earth.add(new THREE.Mesh(
  new THREE.SphereGeometry(CFG.radius, 96, 96),
  new THREE.MeshBasicMaterial({ color: 0x0a151c })
));

// --- subtle inner shell for depth ---
earth.add(new THREE.Mesh(
  new THREE.SphereGeometry(CFG.radius * 0.995, 64, 64),
  new THREE.MeshBasicMaterial({ color: 0x0d2a26 })
));

// --- graticule (lat/long grid) ---
function buildGraticule() {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.10 });
  const r = CFG.radius * 1.001;
  for (let lat = -80; lat <= 80; lat += 20) {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 4) pts.push(lonLatToVec3(lon, lat, r));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  for (let lon = -180; lon < 180; lon += 20) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 4) pts.push(lonLatToVec3(lon, lat, r));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  return g;
}
earth.add(buildGraticule());

// --- atmosphere fresnel glow ---
const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(CFG.radius * 1.16, 64, 64),
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: ACCENT } },
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

// --- country borders (loaded async) ---
async function loadBorders() {
  try {
    const topo = await fetch(CFG.worldData).then(r => r.json());
    const geo = topojson.feature(topo, topo.objects.countries);
    const mat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.55 });
    const group = new THREE.Group();
    const r = CFG.radius * 1.002;

    const addRing = (ring) => {
      const pts = ring.map(([lon, lat]) => lonLatToVec3(lon, lat, r));
      group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat));
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
    bootLog('! BORDER DATA UNREACHABLE — GRID ONLY');
    return false;
  }
}

// ============================================================
//  LOCATION MARKER
// ============================================================
let marker = null;
const rings = [];

function placeMarker(lon, lat) {
  if (marker) earth.remove(marker);
  marker = new THREE.Group();
  const surface = lonLatToVec3(lon, lat, CFG.radius);
  marker.position.copy(surface);
  marker.lookAt(surface.clone().multiplyScalar(2)); // +Z points outward

  marker.add(new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  ));

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0015, 0.0015, 0.32, 6),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.7 })
  );
  beam.rotation.x = Math.PI / 2;
  beam.position.z = 0.16;
  marker.add(beam);

  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.008, 12, 12),
    new THREE.MeshBasicMaterial({ color: ACCENT })
  );
  tip.position.z = 0.32;
  marker.add(tip);

  rings.length = 0;
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.02, 0.026, 48),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    ring.userData.phase = i / 3;
    marker.add(ring);
    rings.push(ring);
  }
  earth.add(marker);
}

// ============================================================
//  CAMERA FOCUS (fly to coordinate)
// ============================================================
let focusing = false;
const focusTarget = new THREE.Vector3();

function focusOn(lon, lat) {
  const dir = lonLatToVec3(lon, lat, 1).normalize();
  focusTarget.copy(dir.multiplyScalar(CFG.focusDist));
  focusing = true;
  controls.autoRotate = false;
}

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
  placeMarker(lon, lat);
  focusOn(lon, lat);

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
  } else {
    $('hdg-src').textContent = 'N-UP';
  }
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
  await loadBorders();
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

  if (focusing) {
    camera.position.lerp(focusTarget, 0.045);
    if (camera.position.distanceTo(focusTarget) < 0.008) focusing = false;
  }

  for (const ring of rings) {
    ring.userData.phase = (ring.userData.phase + dt * 0.5) % 1;
    const s = 1 + ring.userData.phase * 7;
    ring.scale.set(s, s, s);
    ring.material.opacity = 0.9 * (1 - ring.userData.phase);
  }

  controls.update();
  renderer.render(scene, camera);

  $('sb-rng').textContent = camera.position.length().toFixed(2) + ' R';
  frames++; fpsT += dt;
  if (fpsT >= 0.5) { $('sb-fps').textContent = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
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
