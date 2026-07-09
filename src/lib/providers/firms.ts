/** NASA FIRMS active-fire detections as a WMS raster overlay (BYO MAP_KEY).
 *
 *  Why WMS and not the CSV area API: the FIRMS mapserver sends
 *  `access-control-allow-origin: *` on successful responses (verified
 *  2026-07-06), so tiles load directly in the browser with zero backend;
 *  the /api/area CSV endpoint returned no CORS header on its error
 *  responses, so it can't be relied on keyless-browser-side. The overlay is
 *  rendered by NASA, not parsed by us — detections are NOT GeoEvents, so
 *  they don't appear in the timeline/inspector and are labeled as an
 *  overlay, never as itemized events.
 *
 *  A free MAP_KEY comes from https://firms.modaps.eosdis.nasa.gov/api/map_key/
 *  and is stored only in this browser (same policy as the AI analyst key).
 */

export const FIRMS_META = {
  id: 'firms',
  name: 'Fire hotspots (NASA FIRMS)',
  license: 'NASA LANCE FIRMS — free MAP_KEY required',
  homepage: 'https://firms.modaps.eosdis.nasa.gov/',
};

/** VIIRS S-NPP detections from the last 24h — the standard NRT layer. */
export const FIRMS_WMS_LAYER = 'fires_viirs_snpp_24';

const BASE = 'https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires';

/** MapLibre raster-tile URL template ({bbox-epsg-3857} is expanded per tile). */
export function firmsWmsTileUrl(mapKey: string): string {
  const params = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap',
    LAYERS: FIRMS_WMS_LAYER, CRS: 'EPSG:3857',
    WIDTH: '256', HEIGHT: '256', FORMAT: 'image/png', TRANSPARENT: 'TRUE',
  });
  return `${BASE}/${encodeURIComponent(mapKey)}/?${params.toString()}&BBOX={bbox-epsg-3857}`;
}

/** Reachability check for provider health. The WMS endpoint does not reject
 *  bad keys (it serves tiles regardless), so this can only verify that the
 *  service is up and answering — health reports reachability, not key
 *  validity, and the panel says so. */
export async function checkFirms(mapKey: string): Promise<{ ok: boolean; latencyMs: number; error: string | null }> {
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(mapKey)}/?SERVICE=WMS&REQUEST=GetCapabilities`);
    const latencyMs = Math.round(performance.now() - t0);
    if (!res.ok) return { ok: false, latencyMs, error: `HTTP ${res.status}` };
    const text = await res.text();
    if (!text.includes(FIRMS_WMS_LAYER)) return { ok: false, latencyMs, error: 'WMS capabilities missing expected fire layer' };
    return { ok: true, latencyMs, error: null };
  } catch (err) {
    return { ok: false, latencyMs: Math.round(performance.now() - t0), error: err instanceof Error ? err.message : String(err) };
  }
}
