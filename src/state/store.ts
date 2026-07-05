import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DataMode, GeoEvent, ProviderHealth } from '../lib/providers/types';
import { fetchUsgs, USGS_META } from '../lib/providers/usgs';
import { fetchEonet, EONET_META } from '../lib/providers/eonet';
import { fetchNws, NWS_META } from '../lib/providers/nws';
import { fetchGdacs, GDACS_META } from '../lib/providers/gdacs';
import { fetchMarkets, MARKETS_META, type MarketQuote } from '../lib/providers/markets';
import { fetchPowerPlants, fetchLaunchSites, POWER_PLANTS_META, LAUNCH_SITES_META } from '../lib/providers/infrastructure';
import { fetchFomcCalendar, FOMC_META, type FomcMeeting } from '../lib/econcalendar';
import { isEventVisible, type LayerDef } from '../lib/layers';
import { findRelated } from '../lib/graph';
import type { Dossier } from '../lib/dossier';
import {
  putSnapshot, deleteSnapshot, getSnapshot, listSnapshots, diffSnapshot,
  type SnapshotMeta, type SnapshotDelta,
} from '../lib/snapshots';
import { hhmm } from '../lib/format';
import { computeCountryRisk } from '../lib/risk';
import {
  loadCountries, loadCapitals, COUNTRIES_META,
  type CountryFeature,
} from '../lib/countries';
import {
  askAnalyst as runAskAnalyst, buildContext,
  type AnalystProvider, type AnalystMessage,
} from '../lib/analyst';

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

/** Map projection mode: '2d' = mercator, '3d' = globe. A user setting —
 *  switching must never reset layers, selection, filters, or time window
 *  (all of that lives in this store, not in the map). */
export type MapProjection = '2d' | '3d';

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
  projection: MapProjection;
  /** day/night terminator overlay: a user setting, persisted like projection */
  showTerminator: boolean;
  /** vendored Natural Earth boundaries; loaded once, never persisted */
  countries: CountryFeature[] | null;
  /** vendored FOMC schedule; loaded once, never persisted */
  fomcMeetings: FomcMeeting[] | null;
  capitals: Record<string, string> | null;
  selectedCountry: CountryFeature | null;
  /** when true, the timeline drawer filters to events inside selectedCountry */
  countryTimeline: boolean;
  view: 'map' | 'graph';
  graph: GraphState;
  timeWindow: TimeWindow;
  snapshots: SnapshotMeta[];
  snapshotDelta: SnapshotDelta | null;
  /** non-geo market snapshot for the MARKETS panel; mode is real, never faked */
  market: { quotes: MarketQuote[]; mode: DataMode; error: string | null };
  /** user-curated report workspace; citations frozen at pin time */
  dossier: Dossier;
  /** optional BYO-key AI analyst; local-rules fallback is always available */
  analyst: { provider: AnalystProvider | null; apiKey: string | null; baseUrl: string | null; messages: AnalystMessage[] };

  toggleLayer: (id: string) => void;
  toggleSource: (id: string) => void;
  addMonitor: (term: string) => void;
  removeMonitor: (id: string) => void;
  select: (e: GeoEvent | null) => void;
  setMobileRail: (r: 'left' | 'right' | null) => void;
  flyTo: (center: [number, number], zoom: number) => void;
  setProjection: (p: MapProjection) => void;
  setShowTerminator: (on: boolean) => void;
  loadCountryData: () => Promise<void>;
  loadFomcCalendar: () => Promise<void>;
  selectCountry: (c: CountryFeature | null) => void;
  setCountryTimeline: (on: boolean) => void;
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
  pinToDossier: (e: GeoEvent) => void;
  unpinFromDossier: (id: string) => void;
  setDossierNote: (id: string, note: string) => void;
  setDossierTitle: (title: string) => void;
  clearDossier: () => void;
  setAnalystProvider: (p: AnalystProvider | null) => void;
  setAnalystKey: (key: string | null) => void;
  setAnalystBaseUrl: (url: string | null) => void;
  clearAnalystKey: () => void;
  askAnalyst: (question: string) => Promise<void>;
  clearAnalystMessages: () => void;
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
  { id: 'disaster-alerts', name: 'Disaster alerts (GDACS)', group: 'Advisories', enabled: true, providerId: 'gdacs', eventTypes: ['disaster-alert'], color: '#f06e9c' },
  { id: 'nuclear-plants', name: 'Nuclear power plants', group: 'Infrastructure', enabled: true, providerId: 'power-plants', eventTypes: ['nuclear-plant'], color: '#ffb703' },
  { id: 'launch-sites', name: 'Space launch sites', group: 'Infrastructure', enabled: true, providerId: 'launch-sites', eventTypes: ['launch-site'], color: '#00d4ff' },
];

const FETCHERS: Record<string, (signal?: AbortSignal) => ReturnType<typeof fetchUsgs>> = {
  usgs: fetchUsgs,
  eonet: fetchEonet,
  nws: fetchNws,
  gdacs: fetchGdacs,
  'power-plants': fetchPowerPlants,
  'launch-sites': fetchLaunchSites,
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      layers: DEFAULT_LAYERS,
      providers: {
        usgs: providerStub(USGS_META), eonet: providerStub(EONET_META), nws: providerStub(NWS_META),
        gdacs: providerStub(GDACS_META), markets: providerStub(MARKETS_META),
        'power-plants': providerStub(POWER_PLANTS_META), 'launch-sites': providerStub(LAUNCH_SITES_META),
      },
      sources: { usgs: true, eonet: true, nws: true, gdacs: true, markets: true, 'power-plants': true, 'launch-sites': true },
      monitors: [],
      events: [],
      selected: null,
      mobileRail: null,
      mapCmd: null,
      projection: '2d',
      showTerminator: false,
      countries: null,
      fomcMeetings: null,
      capitals: null,
      selectedCountry: null,
      countryTimeline: false,
      view: 'map',
      graph: { nodes: [], edges: [], layout: 'force' },
      timeWindow: { cursor: null, playing: false },
      snapshots: [],
      snapshotDelta: null,
      market: { quotes: [], mode: 'loading', error: null },
      dossier: { title: 'Terra Watch dossier', items: [] },
      analyst: { provider: null, apiKey: null, baseUrl: null, messages: [] },

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

      // selecting an event shows its card; the country highlight (if any) stays
      select: (e) => set({ selected: e }),

      loadCountryData: async () => {
        try {
          const [fc, capitals] = await Promise.all([loadCountries(), loadCapitals()]);
          set((s) => ({
            countries: fc.features,
            capitals,
            providers: {
              ...s.providers,
              // vendored static dataset: honestly labeled 'cache', never 'live'
              [COUNTRIES_META.id]: {
                id: COUNTRIES_META.id, name: COUNTRIES_META.name, status: 'cache',
                lastSuccessAt: Date.now(), latencyMs: null, itemCount: fc.features.length,
                error: null, license: COUNTRIES_META.license, homepage: COUNTRIES_META.homepage,
              },
            },
          }));
        } catch (err) {
          set((s) => ({
            providers: {
              ...s.providers,
              [COUNTRIES_META.id]: {
                id: COUNTRIES_META.id, name: COUNTRIES_META.name, status: 'offline',
                lastSuccessAt: null, latencyMs: null, itemCount: 0,
                error: err instanceof Error ? err.message : String(err),
                license: COUNTRIES_META.license, homepage: COUNTRIES_META.homepage,
              },
            },
          }));
        }
      },

      loadFomcCalendar: async () => {
        try {
          const meetings = await fetchFomcCalendar();
          set((s) => ({
            fomcMeetings: meetings,
            providers: {
              ...s.providers,
              // vendored static schedule: honestly labeled 'cache', never 'live'
              [FOMC_META.id]: {
                id: FOMC_META.id, name: FOMC_META.name, status: 'cache',
                lastSuccessAt: Date.now(), latencyMs: null, itemCount: meetings.length,
                error: null, license: FOMC_META.license, homepage: FOMC_META.homepage,
              },
            },
          }));
        } catch (err) {
          set((s) => ({
            providers: {
              ...s.providers,
              [FOMC_META.id]: {
                id: FOMC_META.id, name: FOMC_META.name, status: 'offline',
                lastSuccessAt: null, latencyMs: null, itemCount: 0,
                error: err instanceof Error ? err.message : String(err),
                license: FOMC_META.license, homepage: FOMC_META.homepage,
              },
            },
          }));
        }
      },

      selectCountry: (c) =>
        set((s) => ({
          selectedCountry: c,
          // a country card replaces any event card; clearing also drops the filter
          selected: c ? null : s.selected,
          countryTimeline: c ? s.countryTimeline : false,
        })),

      setCountryTimeline: (on) => set({ countryTimeline: on }),
      setMobileRail: (r) => set({ mobileRail: r }),
      flyTo: (center, zoom) => set((s) => ({ mapCmd: { seq: (s.mapCmd?.seq ?? 0) + 1, center, zoom } })),
      setProjection: (p) => set({ projection: p }),
      setShowTerminator: (on) => set({ showTerminator: on }),

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

      pinToDossier: (e) =>
        set((s) => {
          if (s.dossier.items.some((i) => i.id === e.id)) return s;
          // freeze provider attribution now so the export stays cited even if
          // the source is later disabled or its health record changes
          const p = s.providers[e.sourceId];
          const citation = {
            name: p?.name ?? e.sourceId,
            license: p?.license ?? 'unknown license',
            homepage: p?.homepage ?? '',
          };
          const item = { id: e.id, event: e, citation, note: '', addedAt: Date.now() };
          return { dossier: { ...s.dossier, items: [...s.dossier.items, item] } };
        }),

      unpinFromDossier: (id) =>
        set((s) => ({ dossier: { ...s.dossier, items: s.dossier.items.filter((i) => i.id !== id) } })),

      setDossierNote: (id, note) =>
        set((s) => ({
          dossier: { ...s.dossier, items: s.dossier.items.map((i) => (i.id === id ? { ...i, note } : i)) },
        })),

      setDossierTitle: (title) => set((s) => ({ dossier: { ...s.dossier, title } })),

      clearDossier: () => set((s) => ({ dossier: { ...s.dossier, items: [] } })),

      setAnalystProvider: (p) => set((s) => ({ analyst: { ...s.analyst, provider: p } })),
      setAnalystKey: (key) => set((s) => ({ analyst: { ...s.analyst, apiKey: key } })),
      setAnalystBaseUrl: (url) => set((s) => ({ analyst: { ...s.analyst, baseUrl: url } })),
      clearAnalystKey: () => set((s) => ({ analyst: { ...s.analyst, provider: null, apiKey: null, baseUrl: null } })),
      clearAnalystMessages: () => set((s) => ({ analyst: { ...s.analyst, messages: [] } })),

      askAnalyst: async (question) => {
        const { events, dossier, monitors, analyst } = get();
        const ctx = buildContext(events, dossier, computeCountryRisk(events));
        set((s) => ({ analyst: { ...s.analyst, messages: [...s.analyst.messages, { role: 'user', text: question, citations: [], mode: 'local-rules' as const }] } }));
        const reply = await runAskAnalyst(question, { provider: analyst.provider, apiKey: analyst.apiKey, baseUrl: analyst.baseUrl }, ctx, monitors);
        set((s) => ({ analyst: { ...s.analyst, messages: [...s.analyst.messages, reply] } }));
      },

      refreshAll: async () => {
        const { sources } = get();
        const active = Object.keys(FETCHERS).filter((id) => sources[id] ?? true);
        const marketsOn = sources['markets'] ?? true;
        set((s) => {
          const providers = { ...s.providers };
          for (const id of active) providers[id] = { ...providers[id], status: 'loading' };
          if (marketsOn) providers['markets'] = { ...providers['markets'], status: 'loading' };
          return { providers };
        });
        const [results, marketRes] = await Promise.all([
          Promise.all(active.map(async (id) => ({ id, r: await FETCHERS[id]() }))),
          marketsOn ? fetchMarkets() : Promise.resolve(null),
        ]);
        if (marketRes) {
          set((s) => ({
            market: { quotes: marketRes.quotes, mode: marketRes.mode, error: marketRes.error },
            providers: {
              ...s.providers,
              markets: { ...s.providers['markets'], status: marketRes.mode, latencyMs: marketRes.latencyMs, itemCount: marketRes.quotes.length, error: marketRes.error, lastSuccessAt: marketRes.mode === 'live' ? Date.now() : s.providers['markets'].lastSuccessAt },
            },
          }));
        }
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
        projection: s.projection,
        showTerminator: s.showTerminator,
        layerEnabled: Object.fromEntries(s.layers.map((l) => [l.id, l.enabled])),
        // graph nodes and dossier items are deliberate user-curated workspaces
        // (like monitors), not live-data caches, so they're persisted the same
        // way — never raw fetch results.
        graph: s.graph,
        dossier: s.dossier,
        // only the BYO-key settings persist — chat messages are transient,
        // like fetched data
        analystSettings: { provider: s.analyst.provider, apiKey: s.analyst.apiKey, baseUrl: s.analyst.baseUrl },
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as {
          sources?: Record<string, boolean>;
          monitors?: Monitor[];
          projection?: MapProjection;
          showTerminator?: boolean;
          layerEnabled?: Record<string, boolean>;
          graph?: GraphState;
          dossier?: Dossier;
          analystSettings?: { provider: AnalystProvider | null; apiKey: string | null; baseUrl: string | null };
        };
        return {
          ...current,
          sources: { ...current.sources, ...(p.sources ?? {}) },
          monitors: p.monitors ?? current.monitors,
          projection: p.projection ?? current.projection,
          showTerminator: p.showTerminator ?? current.showTerminator,
          layers: current.layers.map((l) => (p.layerEnabled && l.id in p.layerEnabled ? { ...l, enabled: p.layerEnabled[l.id] } : l)),
          graph: p.graph ?? current.graph,
          dossier: p.dossier ?? current.dossier,
          analyst: p.analystSettings ? { ...current.analyst, ...p.analystSettings } : current.analyst,
        };
      },
    },
  ),
);
