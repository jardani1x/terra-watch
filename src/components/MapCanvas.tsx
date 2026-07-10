import { useEffect, useRef, useState } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore, type Monitor } from '../state/store';
import type { GeoEvent } from '../lib/providers/types';
import { layerIdForEvent, isEventVisible, type LayerDef } from '../lib/layers';
import { matchMonitor } from '../lib/monitors';
import { prefersReducedMotion } from '../lib/a11y';
import { nightPolygon } from '../lib/terminator';
import { firmsWmsTileUrl, FIRMS_META } from '../lib/providers/firms';
import { countryAtPoint } from '../lib/countries';
import { countryAlertLevels, ALERT_COLORS } from '../lib/alertLevels';
import { computeSignals } from '../lib/signals';
import { computeCountryRisk } from '../lib/risk';
import { CHOKEPOINTS } from '../lib/chokepoints';
import { tradeRouteLines } from '../lib/routes';

// Keyless CARTO raster basemaps (free, attribution required). Two looks ship:
// 'vivid' (voyager, colorful — the default) and 'dark'; both live in the style
// and the store's persisted `basemap` setting flips layer visibility, so
// switching never rebuilds sources or disturbs overlays.
const cartoTiles = (path: string) => ['a', 'b', 'c'].map((s) => `https://${s}.basemaps.cartocdn.com/${path}/{z}/{x}/{y}.png`);
const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: { type: 'raster', tiles: cartoTiles('dark_all'), tileSize: 256, attribution: '© OpenStreetMap contributors © CARTO' },
    'carto-vivid': { type: 'raster', tiles: cartoTiles('rastertiles/voyager'), tileSize: 256, attribution: '© OpenStreetMap contributors © CARTO' },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0a1118' } },
    // dark look gets its blacks lifted + a touch of saturation so land/sea/
    // labels separate instead of reading as one murky slab
    { id: 'carto', type: 'raster', source: 'carto', layout: { visibility: 'none' }, paint: { 'raster-opacity': 1, 'raster-brightness-min': 0.09, 'raster-saturation': 0.15, 'raster-contrast': 0.06 } },
    { id: 'carto-vivid', type: 'raster', source: 'carto-vivid', layout: { visibility: 'none' }, paint: { 'raster-opacity': 1, 'raster-saturation': 0.25, 'raster-brightness-min': 0.03 } },
  ],
};

// GPS pin artwork: a top-down F-22 silhouette (original artwork, public-OSINT
// posture — see PRIVACY_AND_CIVILIAN_USE). Inline SVG so no sprite/image
// pipeline is needed. 24 px wide per spec (was 26).
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

const ALERT_SIZE: Record<string, number> = { Extreme: 11, Severe: 9, Moderate: 7, Minor: 5 };
const GDACS_LEVEL_SIZE: Record<string, number> = { Red: 11, Orange: 8, Green: 5.5 };

function sizeOf(e: GeoEvent): number {
  if (e.type === 'earthquake' && e.magnitude != null) return Math.max(3, Math.min(20, e.magnitude * 2.2));
  if (e.type === 'weather-alert') return ALERT_SIZE[String(e.props.severity)] ?? 6;
  if (e.type === 'disaster-alert') return GDACS_LEVEL_SIZE[String(e.props.alertLevel)] ?? 6;
  return 6;
}

function toFeatureCollection(events: GeoEvent[], layers: LayerDef[], monitors: Monitor[]): FeatureCollection {
  const colorByLayer = Object.fromEntries(layers.map((l) => [l.id, l.color]));
  return {
    type: 'FeatureCollection',
    features: events
      .filter((e) => isEventVisible(e, layers))
      .map((e) => {
        const owner = layerIdForEvent(e, layers);
        // earthquakes keep a magnitude ramp; other layers use their layer color
        const color = e.type === 'earthquake'
          ? (e.magnitude ?? 0) >= 6 ? '#ff5a52' : (e.magnitude ?? 0) >= 5 ? '#ffb454' : '#45e0b0'
          : (owner ? colorByLayer[owner] : '#45e0b0');
        const match = matchMonitor(e, monitors);
        return {
          type: 'Feature',
          id: e.id,
          geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
          properties: {
            id: e.id, color, size: sizeOf(e), title: e.title,
            ...(match ? { monitorColor: match.color } : {}),
          },
        } as Feature;
      }),
  };
}

/** True while the map instance still has a live style. After map.remove() —
 *  or if maplibre dies internally (seen with SwiftShader shader-compile
 *  failures on headless/software-GL) — `style` is null at runtime and any
 *  getSource/getLayer/setFilter call throws, which would crash the whole
 *  React tree. Every effect that touches the map goes through this guard so
 *  a dead map degrades to a blank canvas instead of a dead app. */
function alive(m: maplibregl.Map | null): m is maplibregl.Map {
  return !!m && !!(m as unknown as { style: unknown }).style;
}

export default function MapCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);

  const events = useStore((s) => s.events);
  const layers = useStore((s) => s.layers);
  const monitors = useStore((s) => s.monitors);
  const select = useStore((s) => s.select);
  const mapCmd = useStore((s) => s.mapCmd);
  const timeCursor = useStore((s) => s.timeWindow.cursor);
  const projection = useStore((s) => s.projection);
  const countries = useStore((s) => s.countries);
  const selectedCountry = useStore((s) => s.selectedCountry);
  const showTerminator = useStore((s) => s.showTerminator);
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

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: STYLE,
      center: [10, 25],
      zoom: 1.6,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current = map;
    // e2e hook: lets Playwright drive precise map interactions (project
    // lng/lat → px) and assert the events layer actually rendered
    (window as unknown as { __terraMap?: maplibregl.Map }).__terraMap = map;

    map.on('load', () => {
      const st = useStore.getState();
      // un-hide the chosen basemap before anything below can throw — a
      // failure later in this handler then degrades to a bare basemap
      // instead of a permanently black canvas
      map.setLayoutProperty(st.basemap === 'dark' ? 'carto' : 'carto-vivid', 'visibility', 'visible');
      // derived reference overlays (Phase 2A): static chokepoints + routes,
      // recomputed signal hotspots; visibility driven by store toggles
      map.addSource('chokepoints', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: CHOKEPOINTS.map((c) => ({
            type: 'Feature', properties: { name: c.name, region: c.region },
            geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
          })),
        } as FeatureCollection,
      });
      map.addSource('trade-routes', { type: 'geojson', data: tradeRouteLines() });
      map.addSource('derived-hotspots', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as FeatureCollection });
      map.addLayer({
        id: 'trade-routes', type: 'line', source: 'trade-routes',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#6db3ff', 'line-width': 1.4, 'line-opacity': 0.6, 'line-dasharray': [2, 2] },
      });
      map.addLayer({
        id: 'chokepoints', type: 'circle', source: 'chokepoints',
        layout: { visibility: 'none' },
        paint: { 'circle-radius': 5.5, 'circle-color': '#0c1116', 'circle-stroke-color': '#6db3ff', 'circle-stroke-width': 2 },
      });
      map.addLayer({
        id: 'derived-hotspots', type: 'circle', source: 'derived-hotspots',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['+', 8, ['*', 2, ['get', 'types']]],
          'circle-color': '#ff7a3c', 'circle-opacity': 0.18,
          'circle-stroke-color': '#ff7a3c', 'circle-stroke-width': 1.2,
        },
      });
      map.addSource('events', { type: 'geojson', data: toFeatureCollection([], [], []) });
      map.addLayer({
        id: 'events-layer',
        type: 'circle',
        source: 'events',
        paint: {
          'circle-radius': ['get', 'size'],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.78,
          'circle-stroke-width': ['case', ['has', 'monitorColor'], 3, 1],
          'circle-stroke-color': ['case', ['has', 'monitorColor'], ['get', 'monitorColor'], 'rgba(255,255,255,0.5)'],
        },
      });
      // day/night terminator: pure client-side astronomy, no data source, so it
      // sits under the country layer/events (added before them, below "events-layer")
      map.addSource('terminator', { type: 'geojson', data: nightPolygon() });
      map.addLayer({
        id: 'terminator-layer', type: 'fill', source: 'terminator',
        layout: { visibility: st.showTerminator ? 'visible' : 'none' },
        paint: { 'fill-color': '#03060b', 'fill-opacity': 0.38 },
      }, 'events-layer');
      readyRef.current = true;
      setReady(true);
      (map.getSource('events') as maplibregl.GeoJSONSource)?.setData(toFeatureCollection(st.events, st.layers, st.monitors));
      // apply the persisted projection once the style is ready (mercator is
      // already the default, so only call out when the user chose globe);
      // camera, sources, and layers are unaffected by projection switches
      if (st.projection === '3d') map.setProjection({ type: 'globe' });

      map.on('click', 'events-layer', (ev) => {
        const id = ev.features?.[0]?.properties?.id as string | undefined;
        if (!id) return;
        select(useStore.getState().events.find((e) => e.id === id) ?? null);
      });
      map.on('mouseenter', 'events-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'events-layer', () => { map.getCanvas().style.cursor = ''; });

      // keep the store's viewport bounds current so view-scoped search (palette)
      // always reflects what the user is actually looking at
      const pushBounds = () => {
        const b = map.getBounds();
        useStore.getState().setViewBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      };
      map.on('moveend', pushBounds);
      pushBounds();
    });

    return () => { map.remove(); mapRef.current = null; readyRef.current = false; };
  }, [select]);

  // in-view Overpass military-bases refresh: debounced on view changes, only
  // while its (default-off) layer is enabled — no query without opt-in
  const militaryOn = layers.some((l) => l.id === 'military-bases' && l.enabled);
  useEffect(() => {
    if (!militaryOn) return;
    const t = setTimeout(() => { void useStore.getState().refreshMilitary(); }, 1200);
    return () => clearTimeout(t);
  }, [militaryOn, viewBounds]);

  // push data whenever events, layer visibility/colors, monitors, or playback cursor change
  useEffect(() => {
    const map = mapRef.current;
    if (!alive(map) || !readyRef.current) return;
    // reference registries have no real event time — always shown, even mid-scrub
    const windowed = timeCursor === null ? events : events.filter((e) => e.reference || e.time <= timeCursor);
    (map.getSource('events') as maplibregl.GeoJSONSource | undefined)?.setData(toFeatureCollection(windowed, layers, monitors));
  }, [events, layers, monitors, timeCursor]);

  // derived country alert-level fill: recomputed whenever the live feed or
  // the toggle changes; visibility off entirely when disabled or not loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!alive(map) || !map.getLayer('alert-fill')) return;
    if (!showAlertLevels || !conflictZones) {
      map.setLayoutProperty('alert-fill', 'visibility', 'none');
      return;
    }
    map.setLayoutProperty('alert-fill', 'visibility', 'visible');
    const levels = countryAlertLevels(events, conflictZones);
    if (levels.size === 0) {
      map.setPaintProperty('alert-fill', 'fill-color', 'rgba(0,0,0,0)');
      return;
    }
    const expr: unknown[] = ['match', ['get', 'NAME']];
    for (const [name, level] of levels) expr.push(name, ALERT_COLORS[level]);
    expr.push('rgba(0,0,0,0)');
    map.setPaintProperty('alert-fill', 'fill-color', expr as never);
  }, [events, showAlertLevels, conflictZones, ready]);

  // derived overlays (Phase 2A): visibility + recomputed data
  useEffect(() => {
    const map = mapRef.current;
    if (!alive(map) || !ready || !map.getLayer('chokepoints')) return;
    map.setLayoutProperty('chokepoints', 'visibility', derivedLayers.chokepoints ? 'visible' : 'none');
    map.setLayoutProperty('trade-routes', 'visibility', derivedLayers.tradeRoutes ? 'visible' : 'none');
    map.setLayoutProperty('derived-hotspots', 'visibility', derivedLayers.hotspots ? 'visible' : 'none');
    if (derivedLayers.hotspots) {
      const fc: FeatureCollection = {
        type: 'FeatureCollection',
        features: computeSignals(events).map((sig) => ({
          type: 'Feature',
          properties: { types: sig.types.length, count: sig.count },
          geometry: { type: 'Point', coordinates: [sig.lon, sig.lat] },
        })),
      };
      (map.getSource('derived-hotspots') as maplibregl.GeoJSONSource | undefined)?.setData(fc);
    }
  }, [derivedLayers, events, ready]);

  // derived instability fill: normalized country-risk ramp (yellow → red)
  useEffect(() => {
    const map = mapRef.current;
    if (!alive(map) || !map.getLayer('instability-fill')) return;
    if (!derivedLayers.instability) {
      map.setLayoutProperty('instability-fill', 'visibility', 'none');
      return;
    }
    map.setLayoutProperty('instability-fill', 'visibility', 'visible');
    const risks = computeCountryRisk(events);
    const max = risks[0]?.score ?? 0;
    if (max === 0) {
      map.setPaintProperty('instability-fill', 'fill-color', 'rgba(0,0,0,0)');
      return;
    }
    const expr: unknown[] = ['match', ['get', 'NAME']];
    for (const r of risks) {
      const t = r.score / max;
      expr.push(r.country, t >= 0.66 ? '#ff5a52' : t >= 0.33 ? '#ffb454' : '#ffe066');
    }
    expr.push('rgba(0,0,0,0)');
    map.setPaintProperty('instability-fill', 'fill-color', expr as never);
  }, [derivedLayers.instability, events, ready]);

  // static sanctions fill: two-tier country tint from the vendored OFAC/EU/UN
  // summary (comprehensive vs sectoral programs)
  useEffect(() => {
    const map = mapRef.current;
    if (!alive(map) || !map.getLayer('sanctions-fill')) return;
    if (!derivedLayers.sanctions || !sanctions) {
      map.setLayoutProperty('sanctions-fill', 'visibility', 'none');
      return;
    }
    map.setLayoutProperty('sanctions-fill', 'visibility', 'visible');
    if (sanctions.comprehensive.length + sanctions.sectoral.length === 0) {
      map.setPaintProperty('sanctions-fill', 'fill-color', 'rgba(0,0,0,0)');
      return;
    }
    const expr: unknown[] = ['match', ['get', 'NAME']];
    for (const name of sanctions.comprehensive) expr.push(name, '#c85bff');
    for (const name of sanctions.sectoral) expr.push(name, '#7a5bd6');
    expr.push('rgba(0,0,0,0)');
    map.setPaintProperty('sanctions-fill', 'fill-color', expr as never);
  }, [derivedLayers.sanctions, sanctions, ready]);

  // countries: vendored boundaries become a selectable base layer, inserted
  // below the event markers so marker clicks always win
  useEffect(() => {
    const map = mapRef.current;
    if (!alive(map) || !ready || !countries || map.getSource('countries')) return;
    map.addSource('countries', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: countries } as FeatureCollection,
    });
    // invisible but hit-testable fill for click-to-select
    map.addLayer({ id: 'countries-fill', type: 'fill', source: 'countries', paint: { 'fill-opacity': 0 } }, 'events-layer');
    // derived alert-level tint (Phase 1): painted per-country by NAME below
    // the hover/selection layers; color expression set by the effect below
    map.addLayer(
      { id: 'alert-fill', type: 'fill', source: 'countries', paint: { 'fill-opacity': 0.25, 'fill-color': 'rgba(0,0,0,0)' } },
      'countries-fill',
    );
    // derived instability index fill (Phase 2A): continuous ramp, default off
    map.addLayer(
      { id: 'instability-fill', type: 'fill', source: 'countries', layout: { visibility: 'none' }, paint: { 'fill-opacity': 0.3, 'fill-color': 'rgba(0,0,0,0)' } },
      'countries-fill',
    );
    // static sanctions-program tint (Phase 2A Slice 3): two-tier, default off
    map.addLayer(
      { id: 'sanctions-fill', type: 'fill', source: 'countries', layout: { visibility: 'none' }, paint: { 'fill-opacity': 0.3, 'fill-color': 'rgba(0,0,0,0)' } },
      'countries-fill',
    );
    // keyed by NAME, not ADM0_ISO: ISO codes are not unique in Natural Earth
    // (Kosovo shares SRB with Serbia; Somaliland/SOM, N. Cyprus/CYP, AUS ×3)
    const none = ['==', ['get', 'NAME'], '___none___'] as maplibregl.FilterSpecification;
    // hover highlight: brighter fill + white border so the country under the
    // cursor is unmistakable (esp. small ones like Singapore)
    map.addLayer({
      id: 'countries-hover-fill', type: 'fill', source: 'countries', filter: none,
      paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.28 },
    }, 'events-layer');
    map.addLayer({
      id: 'countries-hover-line', type: 'line', source: 'countries', filter: none,
      paint: { 'line-color': '#ffffff', 'line-width': 2.5, 'line-opacity': 1 },
    }, 'events-layer');
    map.addLayer({
      id: 'countries-selected-fill', type: 'fill', source: 'countries', filter: none,
      paint: { 'fill-color': '#45e0b0', 'fill-opacity': 0.12 },
    }, 'events-layer');
    map.addLayer({
      id: 'countries-selected-line', type: 'line', source: 'countries', filter: none,
      paint: { 'line-color': '#45e0b0', 'line-width': 1.4, 'line-opacity': 0.9 },
    }, 'events-layer');

    // ~8 px of slop converted to degrees at the current zoom (world width in
    // CSS px is 512·2^zoom): lets countryAtPoint magnet onto microstates that
    // are sub-pixel at low zoom, and vanishes as the user zooms in
    const slopDeg = () => (8 * 360) / (512 * Math.pow(2, map.getZoom()));

    map.on('click', 'countries-fill', (ev) => {
      // event markers take priority over the country underneath them
      if (map.queryRenderedFeatures(ev.point, { layers: ['events-layer'] }).length > 0) return;
      const st = useStore.getState();
      // resolve by full-resolution geometry, not the rendered feature: tile
      // simplification at low zoom can swallow tiny countries, making the
      // hit-test report the neighbor (click Singapore, get Malaysia)
      const precise = st.countries ? countryAtPoint(st.countries, ev.lngLat.lng, ev.lngLat.lat, slopDeg()) : null;
      const renderedName = ev.features?.[0]?.properties?.NAME as string | undefined;
      st.selectCountry(precise ?? st.countries?.find((f) => f.properties.NAME === renderedName) ?? null);
    });

    let hovered: string | null = null;
    const setHover = (name: string | null) => {
      if (name === hovered || !map.getLayer('countries-hover-line')) return;
      hovered = name;
      const f = ['==', ['get', 'NAME'], name ?? '___none___'] as maplibregl.FilterSpecification;
      map.setFilter('countries-hover-fill', f);
      map.setFilter('countries-hover-line', f);
    };
    map.on('mousemove', 'countries-fill', (ev) => {
      // same precise resolution as click, so the hover highlight matches
      // what a click would select (bbox precheck keeps per-move cost trivial)
      const st = useStore.getState();
      const precise = st.countries ? countryAtPoint(st.countries, ev.lngLat.lng, ev.lngLat.lat, slopDeg()) : null;
      setHover(precise?.properties.NAME ?? (ev.features?.[0]?.properties?.NAME as string | undefined) ?? null);
    });
    map.on('mouseleave', 'countries-fill', () => setHover(null));
  }, [countries, ready]);

  // selected-country highlight (fill + outline) follows the store
  useEffect(() => {
    const map = mapRef.current;
    if (!alive(map) || !ready || !map.getLayer('countries-selected-line')) return;
    const name = selectedCountry?.properties.NAME ?? '___none___';
    const filter = ['==', ['get', 'NAME'], name] as maplibregl.FilterSpecification;
    map.setFilter('countries-selected-fill', filter);
    map.setFilter('countries-selected-line', filter);
  }, [selectedCountry, ready, countries]);

  // FIRMS hotspot overlay (BYO key): raster tiles rendered by NASA's WMS —
  // never itemized events, so it sits under the event markers. The source URL
  // embeds the key, so a key change means remove + re-add.
  useEffect(() => {
    const map = mapRef.current;
    if (!alive(map) || !ready) return;
    if (map.getLayer('firms-wms')) map.removeLayer('firms-wms');
    if (map.getSource('firms-wms')) map.removeSource('firms-wms');
    if (!firmsKey || !firmsOn) return;
    map.addSource('firms-wms', {
      type: 'raster',
      tiles: [firmsWmsTileUrl(firmsKey)],
      tileSize: 256,
      attribution: 'NASA LANCE FIRMS',
    });
    map.addLayer(
      { id: 'firms-wms', type: 'raster', source: 'firms-wms', paint: { 'raster-opacity': 0.85 } },
      'events-layer',
    );
  }, [firmsKey, firmsOn, ready]);

  // basemap look: flip visibility between the two raster layers
  useEffect(() => {
    const map = mapRef.current;
    if (!alive(map) || !ready) return;
    map.setLayoutProperty('carto', 'visibility', basemap === 'dark' ? 'visible' : 'none');
    map.setLayoutProperty('carto-vivid', 'visibility', basemap === 'vivid' ? 'visible' : 'none');
  }, [basemap, ready]);

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

  // the Starship pin: a DOM marker so it needs no sprite/image pipeline
  const gpsMarkerRef = useRef<maplibregl.Marker | null>(null);
  const flownToFixRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    // a DOM Marker never touches the style, so plain map presence suffices;
    // `ready` in the deps retries once the map exists (a fix can arrive first)
    if (!map) return;
    if (!geo.pos) {
      gpsMarkerRef.current?.remove();
      gpsMarkerRef.current = null;
      flownToFixRef.current = false;
      return;
    }
    if (!gpsMarkerRef.current) {
      // maplibre owns the outer element's inline transform (positioning), so
      // the artwork lives on an inner span
      const el = document.createElement('div');
      const inner = document.createElement('span');
      inner.className = 'gps-pin';
      inner.innerHTML = F22_SVG;
      el.appendChild(inner);
      el.title = 'Your device location (GPS · stays in this browser, never sent anywhere)';
      el.setAttribute('aria-label', 'Your device location');
      gpsMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([geo.pos.lon, geo.pos.lat]).addTo(map);
    } else {
      gpsMarkerRef.current.setLngLat([geo.pos.lon, geo.pos.lat]);
    }
    if (!flownToFixRef.current) {
      flownToFixRef.current = true;
      const cam = { center: [geo.pos.lon, geo.pos.lat] as [number, number], zoom: Math.max(map.getZoom(), 9) };
      if (prefersReducedMotion()) map.jumpTo(cam);
      else map.flyTo({ ...cam, essential: true });
    }
  }, [geo.pos, ready]);

  // 2D↔3D switch: projection is style-level in maplibre v5 — the events
  // source/layer, camera, and all store state survive the switch untouched
  useEffect(() => {
    const map = mapRef.current;
    if (!alive(map) || !readyRef.current) return;
    map.setProjection({ type: projection === '3d' ? 'globe' : 'mercator' });
  }, [projection]);

  // terminator: toggle visibility from the store
  useEffect(() => {
    const map = mapRef.current;
    if (!alive(map) || !ready || !map.getLayer('terminator-layer')) return;
    map.setLayoutProperty('terminator-layer', 'visibility', showTerminator ? 'visible' : 'none');
  }, [showTerminator, ready]);

  // terminator: recompute the night polygon periodically (sub-degree drift
  // over minutes, so a coarse refresh is plenty) — pure client astronomy,
  // no network involved
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => {
      const map = mapRef.current;
      if (!alive(map)) return;
      (map.getSource('terminator') as maplibregl.GeoJSONSource | undefined)?.setData(nightPolygon());
    }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [ready]);

  // command-palette / region-driven map navigation
  useEffect(() => {
    const map = mapRef.current;
    if (!alive(map) || !mapCmd) return;
    if (prefersReducedMotion()) map.jumpTo({ center: mapCmd.center, zoom: mapCmd.zoom });
    else map.flyTo({ center: mapCmd.center, zoom: mapCmd.zoom, essential: true });
  }, [mapCmd]);

  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} aria-label="Interactive world map" />;
}
