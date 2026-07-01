import { useEffect, useRef } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '../state/store';
import type { GeoEvent } from '../lib/providers/types';

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

function toFeatureCollection(events: GeoEvent[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: events.map((e) => ({
      type: 'Feature',
      id: e.id,
      geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
      properties: { id: e.id, mag: e.magnitude ?? 1, title: e.title },
    })),
  };
}

export default function MapCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);

  const events = useStore((s) => s.events);
  const layers = useStore((s) => s.layers);
  const select = useStore((s) => s.select);

  // init once
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
      map.addSource('quakes', { type: 'geojson', data: toFeatureCollection([]) });
      map.addLayer({
        id: 'quakes-layer',
        type: 'circle',
        source: 'quakes',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 2.5, 3, 6, 11, 8, 20],
          'circle-color': ['interpolate', ['linear'], ['get', 'mag'], 2.5, '#45e0b0', 5, '#ffb454', 7, '#ff5a52'],
          'circle-opacity': 0.75,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.5)',
        },
      });
      readyRef.current = true;
      // seed with whatever is already in the store
      (map.getSource('quakes') as maplibregl.GeoJSONSource)?.setData(
        toFeatureCollection(useStore.getState().events),
      );

      map.on('click', 'quakes-layer', (ev) => {
        const id = ev.features?.[0]?.properties?.id as string | undefined;
        if (!id) return;
        const found = useStore.getState().events.find((e) => e.id === id) ?? null;
        select(found);
      });
      map.on('mouseenter', 'quakes-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'quakes-layer', () => { map.getCanvas().style.cursor = ''; });
    });

    return () => { map.remove(); mapRef.current = null; readyRef.current = false; };
  }, [select]);

  // push event data to the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource('quakes') as maplibregl.GeoJSONSource | undefined)?.setData(toFeatureCollection(events));
  }, [events]);

  // reflect layer visibility toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const quakes = layers.find((l) => l.id === 'earthquakes');
    if (map.getLayer('quakes-layer')) {
      map.setLayoutProperty('quakes-layer', 'visibility', quakes?.enabled ? 'visible' : 'none');
    }
  }, [layers]);

  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} aria-label="Interactive world map" />;
}
