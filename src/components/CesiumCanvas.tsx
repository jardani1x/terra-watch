import { useEffect, useRef, useState } from 'react';
import {
  BillboardCollection,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ColorMaterialProperty,
  Credit,
  GeoJsonDataSource,
  HeightReference,
  JulianDate,
  Material,
  Math as CesiumMath,
  LabelCollection,
  LabelStyle,
  NearFarScalar,
  PointPrimitiveCollection,
  PolylineCollection,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  WebMapServiceImageryProvider,
  type Billboard,
  type Entity,
  type ImageryLayer,
  type Viewer,
} from 'cesium';
import { useStore, type Monitor } from '../state/store';
import type { GeoEvent } from '../lib/providers/types';
import { layerIdForEvent, isEventVisible, type LayerDef } from '../lib/layers';
import { homePosition } from '../lib/orient';
import { matchMonitor } from '../lib/monitors';
import { prefersReducedMotion } from '../lib/a11y';
import { FIRMS_META, FIRMS_WMS_BASE, FIRMS_WMS_LAYER } from '../lib/providers/firms';
import { countryAtPoint } from '../lib/countries';
import { countryAlertLevels, ALERT_COLORS } from '../lib/alertLevels';
import { computeSignals } from '../lib/signals';
import { computeCountryRisk } from '../lib/risk';
import { CHOKEPOINTS } from '../lib/chokepoints';
import { tradeRouteLines } from '../lib/routes';
import { createTerraViewer, heightForZoom, type TerraViewer } from '../lib/cesium/viewer';
import { startGlobeSpin } from '../lib/cesium/spin';

// GPS pin artwork: a top-down F-22 silhouette (original artwork, public-OSINT
// posture — see PRIVACY_AND_CIVILIAN_USE). Data URI so no sprite/image
// pipeline is needed. 24 px wide per spec.
const F22_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="30" viewBox="0 0 24 30" aria-hidden="true">
  <path d="M12 0 L13.6 5 L13.6 11 L12 13 L10.4 11 L10.4 5 Z" fill="#4a545e"/>
  <path d="M12 3.2 L13 5.6 L12 7.6 L11 5.6 Z" fill="#1e2530"/>
  <path d="M10.4 9 L1 16.5 L1 19 L10.4 16 Z" fill="#39424b"/>
  <path d="M13.6 9 L23 16.5 L23 19 L13.6 16 Z" fill="#39424b"/>
  <path d="M10.4 11 L10.4 24 L13.6 24 L13.6 11 L12 13 Z" fill="#4a545e"/>
  <path d="M9.4 18 L5.5 25.5 L7 26.5 L10.4 21.5 Z" fill="#2f3841"/>
  <path d="M14.6 18 L18.5 25.5 L17 26.5 L13.6 21.5 Z" fill="#2f3841"/>
  <path d="M10.4 24 L8.5 29 L11 27.5 Z" fill="#39424b"/>
  <path d="M13.6 24 L15.5 29 L13 27.5 Z" fill="#39424b"/>
  <rect x="10.9" y="24.5" width="2.2" height="3" rx="1" fill="#8a5a2b"/>
</svg>`;
const F22_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(F22_SVG)}`;

const ALERT_SIZE: Record<string, number> = { Extreme: 11, Severe: 9, Moderate: 7, Minor: 5 };
const GDACS_LEVEL_SIZE: Record<string, number> = { Red: 11, Orange: 8, Green: 5.5 };

/** Marker radius in px (MapLibre circle-radius semantics; Cesium pixelSize is
 *  a diameter, so callers double it). */
function sizeOf(e: GeoEvent): number {
  if (e.type === 'earthquake' && e.magnitude != null) return Math.max(3, Math.min(20, e.magnitude * 2.2));
  if (e.type === 'weather-alert') return ALERT_SIZE[String(e.props.severity)] ?? 6;
  if (e.type === 'disaster-alert') return GDACS_LEVEL_SIZE[String(e.props.alertLevel)] ?? 6;
  return 6;
}

function eventColor(e: GeoEvent, layers: LayerDef[], colorByLayer: Record<string, string>): string {
  // earthquakes keep a magnitude ramp; other layers use their layer color
  if (e.type === 'earthquake') {
    return (e.magnitude ?? 0) >= 6 ? '#ff5a52' : (e.magnitude ?? 0) >= 5 ? '#ffb454' : '#45e0b0';
  }
  const owner = layerIdForEvent(e, layers);
  return (owner ? colorByLayer[owner] : undefined) ?? '#45e0b0';
}

// Cesium Color instances are immutable in our usage and cheap to cache by css string
const colorCache = new Map<string, Color>();
function css(color: string, alpha?: number): Color {
  const key = `${color}|${alpha ?? ''}`;
  let c = colorCache.get(key);
  if (!c) {
    c = Color.fromCssColorString(color) ?? Color.WHITE;
    if (alpha != null) c = c.withAlpha(alpha);
    colorCache.set(key, c);
  }
  return c;
}

/** All the mutable Cesium scene furniture, created once with the viewer. */
interface Prims {
  events: PointPrimitiveCollection;
  sats: PointPrimitiveCollection;
  chokepoints: PointPrimitiveCollection;
  hotspots: PointPrimitiveCollection;
  routes: PolylineCollection;
  billboards: BillboardCollection;
  labels: LabelCollection;
}
type Ctx = TerraViewer & { prims: Prims };

/** Country polygons are one GeoJsonDataSource; every tint (alert level,
 *  instability, sanctions) plus hover/selection is alpha-composited into a
 *  single fill color per country — the Cesium equivalent of MapLibre's four
 *  stacked translucent fill layers. */
interface CountryStyling {
  byName: Map<string, Entity[]>;
  alert: Map<string, string>;
  instability: Map<string, string>;
  sanctions: Map<string, string>;
  hovered: string | null;
  selectedName: string | null;
}

interface Rgba { r: number; g: number; b: number; a: number }
function over(base: Rgba, top: Color, alpha: number): Rgba {
  const a = alpha + base.a * (1 - alpha);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (top.red * alpha + base.r * base.a * (1 - alpha)) / a,
    g: (top.green * alpha + base.g * base.a * (1 - alpha)) / a,
    b: (top.blue * alpha + base.b * base.a * (1 - alpha)) / a,
    a,
  };
}

function composeColor(name: string, s: CountryStyling): Color {
  let c: Rgba = { r: 0, g: 0, b: 0, a: 0 };
  const alert = s.alert.get(name);
  if (alert) c = over(c, css(alert), 0.25);
  const inst = s.instability.get(name);
  if (inst) c = over(c, css(inst), 0.3);
  const sanc = s.sanctions.get(name);
  if (sanc) c = over(c, css(sanc), 0.3);
  if (s.selectedName === name) c = over(c, css('#45e0b0'), 0.12);
  if (s.hovered === name) c = over(c, Color.WHITE, 0.28);
  return new Color(c.r, c.g, c.b, c.a);
}

function applyName(s: CountryStyling, name: string): void {
  const ents = s.byName.get(name);
  if (!ents) return;
  const mat = new ColorMaterialProperty(composeColor(name, s));
  for (const e of ents) if (e.polygon) e.polygon.material = mat;
}

function applyAll(s: CountryStyling): void {
  for (const name of s.byName.keys()) applyName(s, name);
}

/** Label anchor for a country: the vertex average of its largest outer ring —
 *  cheap and good enough for name placement (no geodesic exactness needed). */
function centroidOf(geometry: { type: string; coordinates: unknown }): [number, number] | null {
  let ring: [number, number][] | null = null;
  if (geometry.type === 'Polygon') {
    ring = (geometry.coordinates as [number, number][][])[0] ?? null;
  } else if (geometry.type === 'MultiPolygon') {
    let best = 0;
    for (const poly of geometry.coordinates as [number, number][][][]) {
      const outer = poly[0];
      if (outer && outer.length > best) { best = outer.length; ring = outer; }
    }
  }
  if (!ring || ring.length === 0) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of ring) { sx += x; sy += y; }
  return [sx / ring.length, sy / ring.length];
}

export default function CesiumCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  const [ctx, setCtx] = useState<Ctx | null>(null);

  const events = useStore((s) => s.events);
  const layers = useStore((s) => s.layers);
  const monitors = useStore((s) => s.monitors);
  const mapCmd = useStore((s) => s.mapCmd);
  const timeCursor = useStore((s) => s.timeWindow.cursor);
  const countries = useStore((s) => s.countries);
  const selectedCountry = useStore((s) => s.selectedCountry);
  const showTerminator = useStore((s) => s.showTerminator);
  const showSun = useStore((s) => s.showSun);
  const firmsKey = useStore((s) => s.firmsKey);
  const firmsOn = useStore((s) => s.sources[FIRMS_META.id] ?? true);
  const basemap = useStore((s) => s.basemap);
  const geo = useStore((s) => s.geo);
  const setGeoPos = useStore((s) => s.setGeoPos);
  const showAlertLevels = useStore((s) => s.showAlertLevels);
  const conflictZones = useStore((s) => s.conflictZones);
  const derivedLayers = useStore((s) => s.derivedLayers);
  const sanctions = useStore((s) => s.sanctions);
  const viewBounds = useStore((s) => s.viewBounds);
  const satOn = useStore((s) => s.derivedLayers.satellites);
  const satTles = useStore((s) => s.satTles);

  // satellite identity (from the worker's ready message) + last positions —
  // refs, not state: they change every tick and must not re-render React
  const satMetaRef = useRef<{ names: string[]; ids: string[]; periods: number[] }>({ names: [], ids: [], periods: [] });
  const satPosRef = useRef<Float64Array | null>(null);

  // active globe idle-spin teardown; a noop when no spin is running
  const spinStopRef = useRef<() => void>(() => {});

  const stylingRef = useRef<CountryStyling>({
    byName: new Map(), alert: new Map(), instability: new Map(), sanctions: new Map(),
    hovered: null, selectedName: null,
  });
  const dsRef = useRef<GeoJsonDataSource | null>(null);
  const firmsLayerRef = useRef<ImageryLayer | null>(null);

  // --- viewer creation (async: world imagery/terrain load) + picking + bounds
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    void createTerraViewer(el, {
      basemap: useStore.getState().basemap,
    }).then((tv) => {
      if (cancelled) { tv.viewer.destroy(); return; }
      const { viewer } = tv;
      const scene = viewer.scene;
      const prims: Prims = {
        events: scene.primitives.add(new PointPrimitiveCollection()) as PointPrimitiveCollection,
        sats: scene.primitives.add(new PointPrimitiveCollection()) as PointPrimitiveCollection,
        chokepoints: scene.primitives.add(new PointPrimitiveCollection()) as PointPrimitiveCollection,
        hotspots: scene.primitives.add(new PointPrimitiveCollection()) as PointPrimitiveCollection,
        routes: scene.primitives.add(new PolylineCollection()) as PolylineCollection,
        billboards: scene.primitives.add(new BillboardCollection({ scene })) as BillboardCollection,
        labels: scene.primitives.add(new LabelCollection({ scene })) as LabelCollection,
      };

      // static reference overlays: chokepoints + trade routes (visibility
      // toggled by the derivedLayers effect)
      prims.chokepoints.show = false;
      for (const c of CHOKEPOINTS) {
        prims.chokepoints.add({
          position: Cartesian3.fromDegrees(c.lon, c.lat),
          pixelSize: 11,
          color: css('#0c1116'),
          outlineColor: css('#6db3ff'),
          outlineWidth: 2,
        });
      }
      prims.routes.show = false;
      for (const f of tradeRouteLines().features) {
        if (f.geometry.type !== 'LineString') continue;
        const flat: number[] = [];
        for (const [lon, lat] of f.geometry.coordinates as [number, number][]) flat.push(lon, lat);
        prims.routes.add({
          positions: Cartesian3.fromDegreesArray(flat),
          width: 1.5,
          material: Material.fromType('PolylineDash', { color: css('#6db3ff', 0.6), dashLength: 8 }),
        });
      }
      prims.hotspots.show = false;

      const pickLonLat = (pos: Cartesian2): { lon: number; lat: number } | null => {
        const cart = viewer.camera.pickEllipsoid(pos, scene.globe.ellipsoid);
        if (!cart) return null;
        const c = Cartographic.fromCartesian(cart);
        return { lon: CesiumMath.toDegrees(c.longitude), lat: CesiumMath.toDegrees(c.latitude) };
      };

      // ~8 px of slop converted to degrees at the current camera height: lets
      // countryAtPoint magnet onto microstates that are sub-pixel when zoomed
      // out, and vanishes as the user zooms in
      const slopDeg = () => {
        const h = viewer.camera.positionCartographic?.height ?? heightForZoom(1.6);
        const canvasH = scene.canvas.clientHeight || 512;
        const fovy = (scene.camera.frustum as { fovy?: number }).fovy ?? Math.PI / 3;
        const spanM = 2 * h * Math.tan(fovy / 2);
        return (8 * (spanM / canvasH)) / 111_320;
      };

      const setHover = (name: string | null) => {
        const s = stylingRef.current;
        if (s.hovered === name) return;
        const old = s.hovered;
        s.hovered = name;
        if (old) applyName(s, old);
        if (name) applyName(s, name);
        scene.requestRender();
      };

      const handler = new ScreenSpaceEventHandler(scene.canvas as HTMLCanvasElement);
      // click priority: event markers > satellite dots > countries — same as
      // the MapLibre layer order gave us
      handler.setInputAction((movement: ScreenSpaceEventHandler.PositionedEvent) => {
        const st = useStore.getState();
        const picked = scene.pick(movement.position) as { id?: unknown } | undefined;
        const pid = picked?.id as { kind?: string; id?: string; idx?: number } | undefined;
        if (pid?.kind === 'event' && pid.id) {
          st.select(st.events.find((e) => e.id === pid.id) ?? null);
          return;
        }
        if (pid?.kind === 'sat' && pid.idx != null) {
          const idx = pid.idx;
          const meta = satMetaRef.current;
          const pos = satPosRef.current;
          const alt = pos ? pos[idx * 3 + 2] : NaN;
          st.select({
            id: `celestrak:${meta.ids[idx]}`,
            type: 'satellite',
            category: 'Satellite (SGP4-propagated)',
            lon: pos ? pos[idx * 3] : 0,
            lat: pos ? pos[idx * 3 + 1] : 0,
            title: meta.names[idx] ?? `NORAD ${meta.ids[idx]}`,
            time: Date.now(),
            reference: true,
            sourceId: 'celestrak',
            props: {
              noradId: meta.ids[idx],
              altitudeKm: Number.isNaN(alt) ? undefined : Math.round(alt),
              // the worker pushes 0 for a degenerate/unusable period — omit
              // rather than show a bogus "0 min" orbit
              ...(meta.periods[idx] > 0 ? { periodMin: meta.periods[idx] } : {}),
              note: 'Position propagated from TLE epoch (SGP4) — a computed prediction, not an observation.',
            },
          });
          return;
        }
        // countries resolve by full-resolution geometry (countryAtPoint), not
        // by picking entities: precise on microstates, indifferent to terrain
        const ll = pickLonLat(movement.position);
        if (!ll || !st.countries) return;
        const precise = countryAtPoint(st.countries, ll.lon, ll.lat, slopDeg());
        if (precise) st.selectCountry(precise);
      }, ScreenSpaceEventType.LEFT_CLICK);

      handler.setInputAction((movement: ScreenSpaceEventHandler.MotionEvent) => {
        const st = useStore.getState();
        const picked = scene.pick(movement.endPosition) as { id?: unknown } | undefined;
        const pid = picked?.id as { kind?: string } | undefined;
        (scene.canvas as HTMLCanvasElement).style.cursor = pid?.kind === 'event' || pid?.kind === 'sat' ? 'pointer' : '';
        if (!st.countries) { setHover(null); return; }
        const ll = pickLonLat(movement.endPosition);
        setHover(ll ? countryAtPoint(st.countries, ll.lon, ll.lat, slopDeg())?.properties.NAME ?? null : null);
      }, ScreenSpaceEventType.MOUSE_MOVE);

      // keep the store's viewport bounds current so view-scoped search
      // (palette) always reflects what the user is actually looking at
      const pushBounds = () => {
        const rect = viewer.camera.computeViewRectangle(scene.globe.ellipsoid);
        useStore.getState().setViewBounds(rect
          ? [CesiumMath.toDegrees(rect.west), CesiumMath.toDegrees(rect.south), CesiumMath.toDegrees(rect.east), CesiumMath.toDegrees(rect.north)]
          : [-180, -85, 180, 85]);
      };
      viewer.camera.moveEnd.addEventListener(pushBounds);
      pushBounds();

      // e2e hooks: raw viewer for ad-hoc poking, plus a tiny stable facade
      const w = window as unknown as {
        __terraViewer?: Viewer;
        __terraTest?: { setView: (lon: number, lat: number, height: number) => void; centerLon: () => number; eventCount: () => number };
      };
      w.__terraViewer = viewer;
      w.__terraTest = {
        setView: (lon, lat, height) => {
          viewer.camera.setView({ destination: Cartesian3.fromDegrees(lon, lat, height) });
          scene.requestRender();
        },
        centerLon: () => CesiumMath.toDegrees(viewer.camera.positionCartographic.longitude),
        eventCount: () => prims.events.length,
      };

      cleanup = () => {
        spinStopRef.current();
        handler.destroy();
        dsRef.current = null;
        stylingRef.current.byName.clear();
        if (!viewer.isDestroyed()) viewer.destroy();
      };
      setCtx({ ...tv, prims });
    });
    return () => {
      cancelled = true;
      cleanup?.();
      setCtx(null);
    };
  }, []);

  // in-view Overpass military-bases refresh: debounced on view changes, only
  // while its (default-off) layer is enabled — no query without opt-in
  const militaryOn = layers.some((l) => l.id === 'military-bases' && l.enabled);
  useEffect(() => {
    if (!militaryOn) return;
    const t = setTimeout(() => { void useStore.getState().refreshMilitary(); }, 1200);
    return () => clearTimeout(t);
  }, [militaryOn, viewBounds]);

  // in-view airplanes.live aircraft refresh: same debounce pattern as the
  // military layer — no query without opt-in
  const aviationOn = layers.some((l) => l.id === 'aviation' && l.enabled);
  useEffect(() => {
    if (!aviationOn) return;
    const t = setTimeout(() => { void useStore.getState().refreshAviation(); }, 1200);
    return () => clearTimeout(t);
  }, [aviationOn, viewBounds]);

  // aircraft move ~7 km/min — re-poll every 20 s while enabled (well under
  // the API's ~1 req/s guidance); paused while the tab is hidden
  useEffect(() => {
    if (!aviationOn) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      void useStore.getState().refreshAviation();
    }, 20_000);
    return () => clearInterval(t);
  }, [aviationOn]);

  // satellites: fetch TLEs once the derived toggle turns on
  useEffect(() => {
    if (satOn) void useStore.getState().loadSatellites();
  }, [satOn]);

  // satellites: worker lifecycle — spawn on (toggle && TLEs), propagate every
  // 2 s (paused while hidden), terminate on toggle-off/unmount. Positions get
  // true 3D altitude on the globe (altKm × 1000).
  useEffect(() => {
    if (!ctx) return;
    const coll = ctx.prims.sats;
    if (!satOn || !satTles) {
      coll.show = false;
      ctx.viewer.scene.requestRender();
      return;
    }
    coll.show = true;
    const worker = new Worker(new URL('../workers/sgp4.worker.ts', import.meta.url), { type: 'module' });
    let timer: number | undefined;
    worker.onerror = (ev: ErrorEvent) => {
      // an uncaught worker exception (e.g. a corrupt TLE set) must not leave
      // satellites silently frozen — surface it as an honest offline row
      if (timer) clearInterval(timer);
      useStore.getState().setSatWorkerError(ev.message || 'satellite worker crashed');
    };
    worker.onmessage = (ev: MessageEvent<{ type: 'ready'; names: string[]; ids: string[]; periods: number[] } | { type: 'positions'; buf: ArrayBuffer }>) => {
      const msg = ev.data;
      if (msg.type === 'ready') {
        satMetaRef.current = { names: msg.names, ids: msg.ids, periods: msg.periods };
        worker.postMessage({ type: 'tick', now: Date.now() });
        timer = window.setInterval(() => {
          if (document.hidden) return; // no propagation for a tab nobody sees
          worker.postMessage({ type: 'tick', now: Date.now() });
        }, 2000);
        return;
      }
      const pos = new Float64Array(msg.buf);
      satPosRef.current = pos;
      if (ctx.viewer.isDestroyed()) return;
      coll.removeAll();
      for (let i = 0; i < pos.length / 3; i++) {
        const lonV = pos[i * 3], latV = pos[i * 3 + 1], altKm = pos[i * 3 + 2];
        if (Number.isNaN(lonV) || Number.isNaN(latV)) continue;
        coll.add({
          position: Cartesian3.fromDegrees(lonV, latV, Math.max(altKm, 0) * 1000),
          pixelSize: 3.2,
          color: css('#9fe8ff', 0.85),
          id: { kind: 'sat', idx: i },
        });
      }
      ctx.viewer.scene.requestRender();
    };
    worker.postMessage({ type: 'init', sats: satTles });
    return () => { if (timer) clearInterval(timer); worker.terminate(); };
  }, [ctx, satOn, satTles]);

  // push data whenever events, layer visibility/colors, monitors, or playback cursor change
  useEffect(() => {
    if (!ctx) return;
    const coll = ctx.prims.events;
    coll.removeAll();
    // reference registries have no real event time — always shown, even mid-scrub
    const windowed = timeCursor === null ? events : events.filter((e) => e.reference || e.time <= timeCursor);
    const colorByLayer = Object.fromEntries(layers.map((l) => [l.id, l.color]));
    for (const e of windowed) {
      if (!isEventVisible(e, layers)) continue;
      const match = matchMonitor(e, monitors as Monitor[]);
      coll.add({
        position: Cartesian3.fromDegrees(e.lon, e.lat),
        pixelSize: sizeOf(e) * 2,
        color: css(eventColor(e, layers, colorByLayer), 0.78),
        outlineColor: match ? css(match.color) : css('rgba(255,255,255,0.5)'),
        outlineWidth: match ? 3 : 1,
        id: { kind: 'event', id: e.id },
      });
    }
    ctx.viewer.scene.requestRender();
  }, [ctx, events, layers, monitors, timeCursor]);

  // countries: vendored boundaries load once into a GeoJsonDataSource (ground-
  // clamped so fills drape over terrain); all tints composite per-entity
  useEffect(() => {
    if (!ctx || !countries || dsRef.current) return;
    let cancelled = false;
    void GeoJsonDataSource.load(
      { type: 'FeatureCollection', features: countries },
      // not ground-clamped: classic surface polygons keep their outlines
      // (ground primitives can't draw them), and the keyless view has no
      // terrain to drape over anyway
      { clampToGround: false, fill: Color.TRANSPARENT, stroke: css('rgba(255,255,255,0.45)'), strokeWidth: 1 },
    ).then((ds) => {
      if (cancelled || ctx.viewer.isDestroyed()) return;
      void ctx.viewer.dataSources.add(ds);
      dsRef.current = ds;
      const s = stylingRef.current;
      s.byName.clear();
      const now = JulianDate.now();
      for (const ent of ds.entities.values) {
        const name = ent.properties?.NAME?.getValue(now) as string | undefined;
        if (!name) continue;
        const list = s.byName.get(name);
        if (list) list.push(ent);
        else s.byName.set(name, [ent]);
      }
      applyAll(s);
      // country name labels at each polygon's centroid; fade with distance so
      // the zoomed-out globe stays readable
      const labels = ctx.prims.labels;
      labels.removeAll();
      for (const f of countries) {
        const c = centroidOf(f.geometry as { type: string; coordinates: unknown });
        if (!c) continue;
        labels.add({
          position: Cartesian3.fromDegrees(c[0], c[1]),
          text: f.properties.NAME,
          font: '12px "Segoe UI", system-ui, sans-serif',
          fillColor: css('rgba(255,255,255,0.92)'),
          outlineColor: css('rgba(0,0,0,0.85)'),
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          translucencyByDistance: new NearFarScalar(2.0e6, 1, 3.0e7, 0.4),
        });
      }
      ctx.viewer.scene.requestRender();
    });
    return () => { cancelled = true; };
  }, [ctx, countries]);

  // derived country alert-level tint: recomputed whenever the live feed or
  // the toggle changes
  useEffect(() => {
    if (!ctx) return;
    const s = stylingRef.current;
    s.alert.clear();
    if (showAlertLevels && conflictZones) {
      for (const [name, level] of countryAlertLevels(events, conflictZones)) s.alert.set(name, ALERT_COLORS[level]);
    }
    applyAll(s);
    ctx.viewer.scene.requestRender();
  }, [ctx, events, showAlertLevels, conflictZones, countries]);

  // derived instability tint: normalized country-risk ramp (yellow → red)
  useEffect(() => {
    if (!ctx) return;
    const s = stylingRef.current;
    s.instability.clear();
    if (derivedLayers.instability) {
      const risks = computeCountryRisk(events);
      const max = risks[0]?.score ?? 0;
      if (max > 0) {
        for (const r of risks) {
          const t = r.score / max;
          s.instability.set(r.country, t >= 0.66 ? '#ff5a52' : t >= 0.33 ? '#ffb454' : '#ffe066');
        }
      }
    }
    applyAll(s);
    ctx.viewer.scene.requestRender();
  }, [ctx, derivedLayers.instability, events, countries]);

  // static sanctions tint: two-tier from the vendored OFAC/EU/UN summary
  useEffect(() => {
    if (!ctx) return;
    const s = stylingRef.current;
    s.sanctions.clear();
    if (derivedLayers.sanctions && sanctions) {
      for (const name of sanctions.comprehensive) s.sanctions.set(name, '#c85bff');
      for (const name of sanctions.sectoral) s.sanctions.set(name, '#7a5bd6');
    }
    applyAll(s);
    ctx.viewer.scene.requestRender();
  }, [ctx, derivedLayers.sanctions, sanctions, countries]);

  // selected-country highlight follows the store
  useEffect(() => {
    if (!ctx) return;
    const s = stylingRef.current;
    const name = selectedCountry?.properties.NAME ?? null;
    if (s.selectedName === name) return;
    const old = s.selectedName;
    s.selectedName = name;
    if (old) applyName(s, old);
    if (name) applyName(s, name);
    ctx.viewer.scene.requestRender();
  }, [ctx, selectedCountry, countries]);

  // derived overlays (Phase 2A): visibility + recomputed hotspot data
  useEffect(() => {
    if (!ctx) return;
    ctx.prims.chokepoints.show = derivedLayers.chokepoints;
    ctx.prims.routes.show = derivedLayers.tradeRoutes;
    const hs = ctx.prims.hotspots;
    hs.show = derivedLayers.hotspots;
    if (derivedLayers.hotspots) {
      hs.removeAll();
      for (const sig of computeSignals(events)) {
        hs.add({
          position: Cartesian3.fromDegrees(sig.lon, sig.lat),
          pixelSize: 16 + 4 * sig.types.length,
          color: css('#ff7a3c', 0.18),
          outlineColor: css('#ff7a3c'),
          outlineWidth: 1.2,
        });
      }
    }
    ctx.viewer.scene.requestRender();
  }, [ctx, derivedLayers, events]);

  // FIRMS hotspot overlay (BYO key): raster tiles rendered by NASA's WMS —
  // never itemized events. The URL embeds the key, so a key change means
  // remove + re-add.
  useEffect(() => {
    if (!ctx) return;
    const { viewer } = ctx;
    if (firmsLayerRef.current) {
      viewer.imageryLayers.remove(firmsLayerRef.current, true);
      firmsLayerRef.current = null;
    }
    if (!firmsKey || !firmsOn) {
      viewer.scene.requestRender();
      return;
    }
    const layer = viewer.imageryLayers.addImageryProvider(new WebMapServiceImageryProvider({
      url: `${FIRMS_WMS_BASE}/${encodeURIComponent(firmsKey)}/`,
      layers: FIRMS_WMS_LAYER,
      parameters: { transparent: true, format: 'image/png' },
      credit: new Credit('NASA LANCE FIRMS'),
    }));
    layer.alpha = 0.85;
    firmsLayerRef.current = layer;
    viewer.scene.requestRender();
  }, [ctx, firmsKey, firmsOn]);

  // ◐ toggle → Cesium's real day/night lighting on the globe (replaces the
  // old hand-built terminator polygon)
  useEffect(() => {
    if (!ctx) return;
    ctx.viewer.scene.globe.enableLighting = showTerminator;
    ctx.viewer.scene.requestRender();
  }, [ctx, showTerminator]);

  // ☀ toggle → Cesium's real sun (position computed from the system clock)
  useEffect(() => {
    if (!ctx) return;
    if (ctx.viewer.scene.sun) ctx.viewer.scene.sun.show = showSun;
    ctx.viewer.scene.requestRender();
  }, [ctx, showSun]);

  // basemap look: flip visibility between satellite and CARTO dark imagery
  useEffect(() => {
    if (!ctx) return;
    ctx.baseLayer.show = basemap === 'vivid';
    ctx.darkLayer.show = basemap === 'dark';
    ctx.viewer.scene.requestRender();
  }, [ctx, basemap]);

  // the satellite view is always the 3D globe: orient to home (GPS fix or
  // timezone longitude) once on entry, then start the sidereal idle spin —
  // same entry behavior as the MapLibre 3D globe
  useEffect(() => {
    if (!ctx) return;
    const { viewer } = ctx;
    const home = homePosition(useStore.getState().geo.pos);
    const h = Math.max(viewer.camera.positionCartographic?.height ?? 0, heightForZoom(2.2));
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(home.lon, home.lat, h),
      duration: prefersReducedMotion() ? 0 : 1.2,
      complete: () => {
        spinStopRef.current();
        spinStopRef.current = startGlobeSpin(viewer);
      },
    });
    return () => spinStopRef.current();
  }, [ctx]);

  // own-device GPS (opt-in): watch while enabled; position lives only in the
  // store (transient) and is never sent anywhere. Own device only — tracking
  // others is permanently excluded.
  useEffect(() => {
    if (!geo.watching) return;
    if (!('geolocation' in navigator)) {
      setGeoPos(null, 'Geolocation is not available in this browser');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => setGeoPos({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }, null),
      (err) => setGeoPos(null, err.message),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [geo.watching, setGeoPos]);

  // the F-22 pin: a ground-clamped billboard; flies to the first fix once,
  // then the user keeps camera control
  const gpsBillboardRef = useRef<Billboard | null>(null);
  const flownToFixRef = useRef(false);
  useEffect(() => {
    if (!ctx) return;
    const coll = ctx.prims.billboards;
    if (!geo.pos) {
      if (gpsBillboardRef.current) { coll.remove(gpsBillboardRef.current); gpsBillboardRef.current = null; }
      flownToFixRef.current = false;
      ctx.viewer.scene.requestRender();
      return;
    }
    const position = Cartesian3.fromDegrees(geo.pos.lon, geo.pos.lat);
    if (!gpsBillboardRef.current) {
      gpsBillboardRef.current = coll.add({
        position,
        image: F22_DATA_URL,
        width: 24,
        height: 30,
        heightReference: HeightReference.CLAMP_TO_GROUND,
      });
    } else {
      gpsBillboardRef.current.position = position;
    }
    if (!flownToFixRef.current) {
      flownToFixRef.current = true;
      const h = Math.min(ctx.viewer.camera.positionCartographic?.height ?? heightForZoom(1.6), heightForZoom(9));
      ctx.viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(geo.pos.lon, geo.pos.lat, h),
        duration: prefersReducedMotion() ? 0 : 2,
      });
    }
    ctx.viewer.scene.requestRender();
  }, [ctx, geo.pos]);

  // command-palette / region-driven map navigation
  useEffect(() => {
    if (!ctx || !mapCmd) return;
    ctx.viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(mapCmd.center[0], mapCmd.center[1], heightForZoom(mapCmd.zoom)),
      duration: prefersReducedMotion() ? 0 : 2,
    });
  }, [ctx, mapCmd]);

  // requestRenderMode heartbeat: the sun/lighting drift is slow, so one
  // render a minute keeps the day/night state honest at near-zero GPU cost
  useEffect(() => {
    if (!ctx) return;
    const t = window.setInterval(() => {
      if (!document.hidden) ctx.viewer.scene.requestRender();
    }, 60_000);
    return () => window.clearInterval(t);
  }, [ctx]);

  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} aria-label="Interactive world map" />;
}
