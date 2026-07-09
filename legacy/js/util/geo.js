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

// Sample points along the great circle (geodesic) between two lon/lat points.
// Pure spherical interpolation (no THREE) so the same path can be projected onto
// the globe (via lonLatToVec3) AND drawn as a Leaflet polyline on the street map.
// Returns [{lon,lat}, …] of length segs+1, endpoints included.
export function greatCirclePoints(lon1, lat1, lon2, lat2, segs = 64) {
  const d2r = Math.PI / 180, r2d = 180 / Math.PI;
  const φ1 = lat1 * d2r, λ1 = lon1 * d2r, φ2 = lat2 * d2r, λ2 = lon2 * d2r;
  // angular distance between the points
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((φ2 - φ1) / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2
  ));
  if (d === 0 || !isFinite(d)) return [{ lon: lon1, lat: lat1 }, { lon: lon2, lat: lat2 }];
  const out = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    out.push({ lon: Math.atan2(y, x) * r2d, lat: Math.atan2(z, Math.hypot(x, y)) * r2d });
  }
  return out;
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
