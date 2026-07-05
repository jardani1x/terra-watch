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

// Keyless dark basemap: CARTO dark raster tiles (free, attribution required).
const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#05080b' } },
    { id: 'carto', type: 'raster', source: 'carto', paint: { 'raster-opacity': 0.82 } },
  ],
};

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

    map.on('load', () => {
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
        layout: { visibility: useStore.getState().showTerminator ? 'visible' : 'none' },
        paint: { 'fill-color': '#03060b', 'fill-opacity': 0.38 },
      }, 'events-layer');
      readyRef.current = true;
      setReady(true);
      const st = useStore.getState();
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
    });

    return () => { map.remove(); mapRef.current = null; readyRef.current = false; };
  }, [select]);

  // push data whenever events, layer visibility/colors, monitors, or playback cursor change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const windowed = timeCursor === null ? events : events.filter((e) => e.time <= timeCursor);
    (map.getSource('events') as maplibregl.GeoJSONSource | undefined)?.setData(toFeatureCollection(windowed, layers, monitors));
  }, [events, layers, monitors, timeCursor]);

  // countries: vendored boundaries become a selectable base layer, inserted
  // below the event markers so marker clicks always win
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !countries || map.getSource('countries')) return;
    map.addSource('countries', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: countries } as FeatureCollection,
    });
    // invisible but hit-testable fill for click-to-select
    map.addLayer({ id: 'countries-fill', type: 'fill', source: 'countries', paint: { 'fill-opacity': 0 } }, 'events-layer');
    const none = ['==', ['get', 'ADM0_ISO'], '___none___'] as maplibregl.FilterSpecification;
    map.addLayer({
      id: 'countries-selected-fill', type: 'fill', source: 'countries', filter: none,
      paint: { 'fill-color': '#45e0b0', 'fill-opacity': 0.12 },
    }, 'events-layer');
    map.addLayer({
      id: 'countries-selected-line', type: 'line', source: 'countries', filter: none,
      paint: { 'line-color': '#45e0b0', 'line-width': 1.4, 'line-opacity': 0.9 },
    }, 'events-layer');

    map.on('click', 'countries-fill', (ev) => {
      // event markers take priority over the country underneath them
      if (map.queryRenderedFeatures(ev.point, { layers: ['events-layer'] }).length > 0) return;
      const iso = ev.features?.[0]?.properties?.ADM0_ISO as string | undefined;
      const st = useStore.getState();
      const full = st.countries?.find((f) => f.properties.ADM0_ISO === iso) ?? null;
      st.selectCountry(full);
    });
  }, [countries, ready]);

  // selected-country highlight (fill + outline) follows the store
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer('countries-selected-line')) return;
    const iso = selectedCountry?.properties.ADM0_ISO ?? '___none___';
    const filter = ['==', ['get', 'ADM0_ISO'], iso] as maplibregl.FilterSpecification;
    map.setFilter('countries-selected-fill', filter);
    map.setFilter('countries-selected-line', filter);
  }, [selectedCountry, ready, countries]);

  // 2D↔3D switch: projection is style-level in maplibre v5 — the events
  // source/layer, camera, and all store state survive the switch untouched
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setProjection({ type: projection === '3d' ? 'globe' : 'mercator' });
  }, [projection]);

  // terminator: toggle visibility from the store
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer('terminator-layer')) return;
    map.setLayoutProperty('terminator-layer', 'visibility', showTerminator ? 'visible' : 'none');
  }, [showTerminator, ready]);

  // terminator: recompute the night polygon periodically (sub-degree drift
  // over minutes, so a coarse refresh is plenty) — pure client astronomy,
  // no network involved
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => {
      const map = mapRef.current;
      (map?.getSource('terminator') as maplibregl.GeoJSONSource | undefined)?.setData(nightPolygon());
    }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [ready]);

  // command-palette / region-driven map navigation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapCmd) return;
    if (prefersReducedMotion()) map.jumpTo({ center: mapCmd.center, zoom: mapCmd.zoom });
    else map.flyTo({ center: mapCmd.center, zoom: mapCmd.zoom, essential: true });
  }, [mapCmd]);

  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} aria-label="Interactive world map" />;
}
