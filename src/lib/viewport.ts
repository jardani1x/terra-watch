/** Point-in-view test against MapLibre map bounds [west, south, east, north].
 *  MapLibre unwraps longitudes on antimeridian-crossing views (east may exceed
 *  180, west may go below -180), so the point's longitude is shifted into the
 *  same unwrapped range before comparing. */
export type ViewBounds = [number, number, number, number];

export function inViewBounds(lon: number, lat: number, b: ViewBounds): boolean {
  const [w, s, e, n] = b;
  if (lat < s || lat > n) return false;
  if (e - w >= 360) return true; // whole world visible
  let x = lon;
  while (x < w) x += 360;
  while (x - 360 >= w) x -= 360;
  return x <= e;
}
