// ------------------------------------------------------------
//  Geographic / coordinate helpers (pure; no scene state)
//
//  Shared by the marker, graticule, borders, textures and the
//  country-raycast picker. The lat/lon → sphere projection here is
//  the single source of truth; `vec3ToLonLat` is its exact inverse.
// ------------------------------------------------------------
import * as THREE from 'three';

// lat/lon → point on a sphere of radius r (SphereGeometry-compatible).
export function lonLatToVec3(lon, lat, r = 1) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

// Inverse of lonLatToVec3 (earth group is unrotated, so world == local).
export function vec3ToLonLat(p) {
  const v = p.clone().normalize();
  const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(v.y, -1, 1)));
  let lon = THREE.MathUtils.radToDeg(Math.atan2(v.z, -v.x)) - 180;
  lon = ((lon + 540) % 360) - 180;
  return { lon, lat };
}

export function toDMS(value, [pos, neg]) {
  const hemi = value >= 0 ? pos : neg;
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = ((mFloat - m) * 60).toFixed(1);
  return `${d}°${String(m).padStart(2, '0')}'${String(s).padStart(4, '0')}"${hemi}`;
}

// Grid Zone Designator (UTM zone number + MGRS latitude band).
export function gridZone(lat, lon) {
  const zone = Math.floor((lon + 180) / 6) + 1;
  const bands = 'CDEFGHJKLMNPQRSTUVWX';
  let idx = Math.floor((lat + 80) / 8);
  idx = Math.max(0, Math.min(bands.length - 1, idx));
  return `${String(zone).padStart(2, '0')}${bands[idx]}`;
}

const CARDINALS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
export const cardinal = (deg) => CARDINALS[Math.round(((deg % 360) / 22.5)) % 16];

// GeoJSON geometry → array of polygons (each polygon = [outerRing, ...holes]).
export const polysOf = (gm) =>
  gm.type === 'Polygon' ? [gm.coordinates]
  : gm.type === 'MultiPolygon' ? gm.coordinates
  : [];

// Even-odd ray test for a single ring.
export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// poly[0] outer ring, rest are holes.
export function polyContains(poly, lon, lat) {
  if (!pointInRing(lon, lat, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (pointInRing(lon, lat, poly[k])) return false;
  return true;
}
