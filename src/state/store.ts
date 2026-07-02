import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DataMode, GeoEvent, ProviderHealth } from '../lib/providers/types';
import { fetchUsgs, USGS_META } from '../lib/providers/usgs';
import { fetchEonet, EONET_META } from '../lib/providers/eonet';
import { fetchNws, NWS_META } from '../lib/providers/nws';
import { isEventVisible, type LayerDef } from '../lib/layers';
import { findRelated } from '../lib/graph';
import {
  putSnapshot, deleteSnapshot, getSnapshot, listSnapshots, diffSnapshot,
  type SnapshotMeta, type SnapshotDelta,
} from '../lib/snapshots';
import { hhmm } from '../lib/format';

export type { LayerDef } from '../lib/layers';

export interface Monitor {
  id: string;
  term: string;
  color: string;
}

export interface GraphNode {
  id: string;
  event: GeoEvent;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export type GraphLayout = 'force' | 'radial' | 'grid';

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout: GraphLayout;
}

/** Region presets used by the command palette to fly the map. */
export const REGIONS: Record<string, { center: [number, number]; zoom: number }> = {
  World: { center: [10, 25], zoom: 1.6 },
  Europe: { center: [15, 50], zoom: 3 },
  Africa: { center: [20, 2], zoom: 2.4 },
  Asia: { center: [100, 30], zoom: 2.3 },
  Americas: { center: [-90, 15], zoom: 2 },
  Oceania: { center: [140, -25], zoom: 2.8 },
};

const MONITOR_COLORS = ['#45e0b0', '#ffb454', '#6db3ff', '#ff7a3c', '#b39ddb', '#ff5a52'];

interface MapCmd { seq: number; center: [number, number]; zoom: number }

/** Timeline playback: cursor === null means live (now); a timestamp means the
 *  user is scrubbing history. Playback state is always shown in the UI —
 *  scrubbed views are labeled PLAYBACK, never presented as live. */
export interface TimeWindow {
  cursor: number | null;
  playing: boolean;
}

interface AppState {
  layers: LayerDef[];
  providers: Record<string, ProviderHealth>;
  /** per-provider enable flag; disabled sources are not fetched (bandwidth) */
  sources: Record<string, boolean>;
  monitors: Monitor[];
  events: GeoEvent[];
  selected: GeoEvent | null;
  mobileRail: 'left' | 'right' | null;
  mapCmd: MapCmd | null;
  view: 'map' | 'graph';
  graph: GraphState;
  timeWindow: TimeWindow;
  snapshots: SnapshotMeta[];
  snapshotDelta: SnapshotDelta | null;

  toggleLayer: (id: string) => void;
  toggleSource: (id: string) => void;
  addMonitor: (term: string) => void;
  removeMonitor: (id: string) => void;
  select: (e: GeoEvent | null) => void;
  setMobileRail: (r: 'left' | 'right' | null) => void;
  flyTo: (center: [number, number], zoom: number) => void;
  refreshAll: () => Promise<void>;
  visibleEvents: () => GeoEvent[];
  overallMode: () => DataMode;
  setView: (v: 'map' | 'graph') => void;
  addToGraph: (e: GeoEvent) => void;
  removeFromGraph: (id: string) => void;
  searchAround: (id: string) => void;
  clearGraph: () => void;
  setGraphLayout: (l: GraphLayout) => void;
  setTimeCursor: (ms: number | null) => void;
  setPlaying: (p: boolean) => void;
  windowedEvents: () => GeoEvent[];
  loadSnapshots: () => Promise<void>;
  takeSnapshot: () => Promise<void>;
  removeSnapshot: (id: string) => Promise<void>;
  compareSnapshot: (id: string) => Promise<void>;
}

function providerStub(meta: { id: string; name: string; license: string; homepage: string }): ProviderHealth {
  return { id: meta.id, name: meta.name, status: 'loading', lastSuccessAt: null, latencyMs: null, itemCount: 0, error: null, license: meta.license, homepage: meta.homepage };
}

const DEFAULT_LAYERS: LayerDef[] = [
  { id: 'earthquakes', name: 'Earthquakes (M2.5+, 24h)', group: 'Natural events', enabled: true, providerId: 'usgs', eventTypes: ['earthquake'], color: '#45e0b0' },
  { id: 'wildfires', name: 'Wildfires', group: 'Natural events', enabled: true, providerId: 'eonet', eventTypes: ['wildfires'], color: '#ff7a3c' },
  { id: 'volcanoes', name: 'Volcanoes', group: 'Natural events', enabled: true, providerId: 'eonet', eventTypes: ['volcanoes'], color: '#ff5a52' },
  { id: 'severe-storms', name: 'Severe storms', group: 'Natural events', enabled: true, providerId: 'eonet', eventTypes: ['severeStorms'], color: '#6db3ff' },
  { id: 'other-natural', name: 'Other natural events', group: 'Natural events', enabled: false, providerId: 'eonet', eventTypes: [], catchAll: true, color: '#b39ddb' },
  { id: 'weather-alerts', name: 'Weather alerts (US · NWS)', group: 'Advisories', enabled: true, providerId: 'nws', eventTypes: ['weather-alert'], color: '#ffe066' },
];

const FETCHERS: Record<string, (signal?: AbortSignal) => ReturnType<typeof fetchUsgs>> = {
  usgs: fetchUsgs,
  eonet: fetchEonet,
  nws: fetchNws,
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      layers: DEFAULT_LAYERS,
      providers: { usgs: providerStub(USGS_META), eonet: providerStub(EONET_META), nws: providerStub(NWS_META) },
      sources: { usgs: true, eonet: true, nws: true },
      monitors: [],
      events: [],
      selected: null,
      mobileRail: null,
      mapCmd: null,
      view: 'map',
      graph: { nodes: [], edges: [], layout: 'force' },
      timeWindow: { cursor: null, playing: false },
      snapshots: [],
      snapshotDelta: null,

      toggleLayer: (id) =>
        set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)) })),

      toggleSource: (id) => {
        set((s) => ({ sources: { ...s.sources, [id]: !(s.sources[id] ?? true) } }));
        void get().refreshAll();
      },

      addMonitor: (term) => {
        const t = term.trim();
        if (!t) return;
        set((s) => {
          if (s.monitors.some((m) => m.term.toLowerCase() === t.toLowerCase())) return s;
          const color = MONITOR_COLORS[s.monitors.length % MONITOR_COLORS.length];
          return { monitors: [...s.monitors, { id: `${Date.now()}`, term: t, color }] };
        });
      },
      removeMonitor: (id) => set((s) => ({ monitors: s.monitors.filter((m) => m.id !== id) })),

      select: (e) => set({ selected: e }),
      setMobileRail: (r) => set({ mobileRail: r }),
      flyTo: (center, zoom) => set((s) => ({ mapCmd: { seq: (s.mapCmd?.seq ?? 0) + 1, center, zoom } })),

      setView: (v) => set({ view: v }),

      addToGraph: (e) =>
        set((s) => {
          if (s.graph.nodes.some((n) => n.id === e.id)) return s;
          return { graph: { ...s.graph, nodes: [...s.graph.nodes, { id: e.id, event: e }] } };
        }),

      removeFromGraph: (id) =>
        set((s) => ({
          graph: {
            ...s.graph,
            nodes: s.graph.nodes.filter((n) => n.id !== id),
            edges: s.graph.edges.filter((ed) => ed.source !== id && ed.target !== id),
          },
        })),

      searchAround: (id) =>
        set((s) => {
          const node = s.graph.nodes.find((n) => n.id === id);
          if (!node) return s;
          const existingIds = new Set(s.graph.nodes.map((n) => n.id));
          const related = findRelated(node.event, s.events, existingIds);
          const newNodes = related
            .filter((r) => !existingIds.has(r.event.id))
            .map((r) => ({ id: r.event.id, event: r.event }));
          const existingEdgeKeys = new Set(s.graph.edges.map((ed) => [ed.source, ed.target].sort().join('|')));
          const newEdges = related
            .filter((r) => !existingEdgeKeys.has([id, r.event.id].sort().join('|')))
            .map((r) => ({ id: `${id}-${r.event.id}`, source: id, target: r.event.id, label: r.label }));
          return {
            graph: { ...s.graph, nodes: [...s.graph.nodes, ...newNodes], edges: [...s.graph.edges, ...newEdges] },
          };
        }),

      clearGraph: () => set((s) => ({ graph: { ...s.graph, nodes: [], edges: [] } })),

      setGraphLayout: (l) => set((s) => ({ graph: { ...s.graph, layout: l } })),

      setTimeCursor: (ms) =>
        set((s) => ({ timeWindow: { cursor: ms, playing: ms === null ? false : s.timeWindow.playing } })),

      setPlaying: (p) =>
        set((s) => ({
          // starting playback from live begins at the oldest end of the 24h feed
          timeWindow: { cursor: p && s.timeWindow.cursor === null ? Date.now() - 24 * 3600_000 : s.timeWindow.cursor, playing: p },
        })),

      windowedEvents: () => {
        const { events, timeWindow } = get();
        if (timeWindow.cursor === null) return events;
        return events.filter((e) => e.time <= timeWindow.cursor!);
      },

      loadSnapshots: async () => {
        const snapshots = await listSnapshots();
        set({ snapshots });
      },

      takeSnapshot: async () => {
        const { events } = get();
        const at = Date.now();
        const snap = { id: `${at}`, name: `${hhmm(at)} · ${events.length} events`, at, events };
        await putSnapshot(snap);
        set({ snapshots: await listSnapshots() });
      },

      removeSnapshot: async (id) => {
        await deleteSnapshot(id);
        set((s) => ({
          snapshots: s.snapshots.filter((m) => m.id !== id),
          snapshotDelta: s.snapshotDelta?.snapshotId === id ? null : s.snapshotDelta,
        }));
      },

      compareSnapshot: async (id) => {
        const snap = await getSnapshot(id);
        if (!snap) return;
        set({ snapshotDelta: diffSnapshot(snap, get().events) });
      },

      refreshAll: async () => {
        const { sources } = get();
        const active = Object.keys(FETCHERS).filter((id) => sources[id] ?? true);
        set((s) => {
          const providers = { ...s.providers };
          for (const id of active) providers[id] = { ...providers[id], status: 'loading' };
          return { providers };
        });
        const results = await Promise.all(active.map(async (id) => ({ id, r: await FETCHERS[id]() })));
        set((s) => {
          const refetched = new Set(results.map((x) => x.id));
          // keep events from still-enabled sources that weren't just refetched, then add fresh
          const kept = s.events.filter((e) => (s.sources[e.sourceId] ?? true) && !refetched.has(e.sourceId));
          const merged = [...kept, ...results.flatMap(({ r }) => r.events)];
          const providers = { ...s.providers };
          for (const { id, r } of results) {
            providers[id] = { ...providers[id], status: r.mode, latencyMs: r.latencyMs, itemCount: r.events.length, error: r.error, lastSuccessAt: r.mode === 'live' ? Date.now() : providers[id].lastSuccessAt };
          }
          return { events: merged, providers };
        });
      },

      visibleEvents: () => {
        const { events, layers } = get();
        return events.filter((e) => isEventVisible(e, layers));
      },

      overallMode: () => {
        const { layers, providers, sources } = get();
        const enabledProviderIds = new Set(
          layers.filter((l) => l.enabled && (sources[l.providerId] ?? true)).map((l) => l.providerId),
        );
        const activeP = Object.values(providers).filter((p) => enabledProviderIds.has(p.id));
        if (activeP.length === 0) return 'offline';
        if (activeP.some((p) => p.status === 'loading')) return 'loading';
        if (activeP.every((p) => p.status === 'live')) return 'live';
        if (activeP.some((p) => p.status === 'offline')) return 'offline';
        return 'mock';
      },
    }),
    {
      name: 'terra-watch:v2',
      // persist only user settings; never persist fetched data or transient UI
      partialize: (s) => ({
        sources: s.sources,
        monitors: s.monitors,
        layerEnabled: Object.fromEntries(s.layers.map((l) => [l.id, l.enabled])),
        // graph nodes are a deliberate user-curated workspace (like monitors), not a
        // live-data cache, so they're persisted the same way — never raw fetch results.
        graph: s.graph,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as {
          sources?: Record<string, boolean>;
          monitors?: Monitor[];
          layerEnabled?: Record<string, boolean>;
          graph?: GraphState;
        };
        return {
          ...current,
          sources: { ...current.sources, ...(p.sources ?? {}) },
          monitors: p.monitors ?? current.monitors,
          layers: current.layers.map((l) => (p.layerEnabled && l.id in p.layerEnabled ? { ...l, enabled: p.layerEnabled[l.id] } : l)),
          graph: p.graph ?? current.graph,
        };
      },
    },
  ),
);
