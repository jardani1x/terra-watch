import {
  Cartesian3,
  ClockStep,
  Credit,
  ImageryLayer,
  Ion,
  SceneMode,
  UrlTemplateImageryProvider,
  Viewer,
  createWorldImageryAsync,
  createWorldTerrainAsync,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

/** Cesium viewer factory for Terra Watch.
 *
 *  Imagery policy (keyless-first with an opt-in upgrade):
 *  - With `VITE_CESIUM_ION_TOKEN` set (free account at https://ion.cesium.com,
 *    stored only in the local .env.local — never committed), the globe uses
 *    Cesium World Imagery + World Terrain for the full photoreal look.
 *  - Without a token the app still boots and stays useful: keyless Esri World
 *    Imagery satellite tiles on the plain ellipsoid.
 *
 *  requestRenderMode keeps the GPU idle unless something changed — every
 *  mutation elsewhere calls scene.requestRender(). */

/** Rough MapLibre-zoom → camera-height mapping (meters). Calibrated so the
 *  old default view (zoom 1.6) and city-level flyTos land at familiar
 *  framings; exactness is not required, only monotonic feel. */
export function heightForZoom(z: number): number {
  return 35_000_000 / 2 ** z;
}

const ESRI_WORLD_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';

export interface TerraViewer {
  viewer: Viewer;
  /** satellite base imagery — the 'vivid' basemap */
  baseLayer: ImageryLayer;
  /** CARTO dark raster — the 'dark' basemap, hidden unless selected */
  darkLayer: ImageryLayer;
  /** true when Ion token was present and World Imagery/Terrain loaded */
  ion: boolean;
}

export async function createTerraViewer(
  el: HTMLElement,
  opts: { basemap: 'vivid' | 'dark' },
): Promise<TerraViewer> {
  const token = (import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined)?.trim();

  let base: ImageryLayer | null = null;
  let ion = false;
  if (token) {
    Ion.defaultAccessToken = token;
    try {
      base = new ImageryLayer(await createWorldImageryAsync());
      ion = true;
    } catch {
      base = null; // bad/expired token — fall through to the keyless path
    }
  }
  if (!base) {
    base = new ImageryLayer(
      new UrlTemplateImageryProvider({
        url: ESRI_WORLD_IMAGERY,
        maximumLevel: 19,
        credit: new Credit('Esri, Maxar, Earthstar Geographics, and the GIS User Community'),
      }),
    );
  }

  const viewer = new Viewer(el, {
    baseLayer: base,
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    sceneMode: SceneMode.SCENE3D, // the 'sat' view is always the 3D globe
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
  });

  if (ion) {
    try {
      viewer.terrainProvider = await createWorldTerrainAsync();
    } catch {
      // terrain is a nicety — imagery-only is fine
    }
  }

  // second basemap: CARTO dark raster, toggled via ImageryLayer.show so
  // switching never rebuilds providers or disturbs overlays (same policy as
  // the old MapLibre style-level visibility flip)
  const darkLayer = viewer.imageryLayers.addImageryProvider(
    new UrlTemplateImageryProvider({
      url: CARTO_DARK,
      subdomains: ['a', 'b', 'c'],
      maximumLevel: 19,
      credit: new Credit('© OpenStreetMap contributors © CARTO'),
    }),
  );
  darkLayer.show = opts.basemap === 'dark';

  // clock tracks real system time so the built-in sun position, day/night
  // lighting, and star sky are always "now" — replaces the old hand-rolled
  // astronomy tick entirely
  viewer.clock.clockStep = ClockStep.SYSTEM_CLOCK;
  viewer.clock.shouldAnimate = true;

  const scene = viewer.scene;
  scene.globe.enableLighting = false; // ◐ toggle drives this from the store
  if (scene.moon) scene.moon.show = true;
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;

  // same initial framing as the old map: [10, 25] @ zoom 1.6
  viewer.camera.setView({ destination: Cartesian3.fromDegrees(10, 25, heightForZoom(1.6)) });
  scene.requestRender();

  return { viewer, baseLayer: base, darkLayer, ion };
}
