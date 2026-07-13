import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DataMode, GeoEvent, ProviderHealth } from '../lib/providers/types';
import { fetchUsgs, USGS_META } from '../lib/providers/usgs';
import { fetchEonet, EONET_META } from '../lib/providers/eonet';
import { fetchNws, NWS_META } from '../lib/providers/nws';
import { fetchGdacs, GDACS_META } from '../lib/providers/gdacs';
import { fetchMarkets, fetchTopCoins, MARKETS_META, type MarketQuote, type CoinRow } from '../lib/providers/markets';
import { fetchGdeltNews, GDELT_META, REGION_QUERIES, type NewsArticle } from '../lib/providers/gdelt';
import { fetchPowerPlants, fetchLaunchSites, POWER_PLANTS_META, LAUNCH_SITES_META } from '../lib/providers/infrastructure';
import {
  fetchEconCenters, fetchAiDatacenters, fetchNuclearFuelSites,
  ECON_CENTERS_META, AI_DATACENTERS_META, NUCLEAR_FUEL_META,
} from '../lib/providers/registries';
import { fetchMilitaryBases, OSM_MILITARY_META } from '../lib/providers/overpass';
import { fetchAircraft, requiredRadiusNm, AVIATION_META } from '../lib/providers/aviation';
import { fetchFomcCalendar, FOMC_META, type FomcMeeting } from '../lib/econcalendar';
import { checkFirms, FIRMS_META } from '../lib/providers/firms';
import { fetchTles, CELESTRAK_META, type TleSet } from '../lib/providers/celestrak';
import { isEventVisible, type LayerDef } from '../lib/layers';
import type { ViewBounds } from '../lib/viewport';
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

/** Basemap look: 'vivid' = CARTO voyager (colorful), 'dark' = CARTO dark. A
 *  persisted user setting like projection. */
export type Basemap = 'vivid' | 'dark';

/** Own-device GPS position (opt-in "locate me"). Transient by design: never
 *  persisted, never sent anywhere — it exists only in this browser session.
 *  This tracks the user's own device only; tracking other people is
 *  permanently excluded (see PRIVACY_AND_CIVILIAN_USE). */
export interface GeoSelf {
  watching: boolean;
  pos: { lat: number; lon: number; accuracy: number } | null;
  error: string | null;
}

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
  /** desktop rail collapse (persisted user setting); mobileRail is separate */
  railCollapsed: { left: boolean; right: boolean };
  mapCmd: MapCmd | null;
  /** current map viewport [west, south, east, north]; transient, never persisted */
  viewBounds: ViewBounds | null;
  projection: MapProjection;
  /** day/night terminator overlay: a user setting, persisted like projection */
  showTerminator: boolean;
  basemap: Basemap;
  geo: GeoSelf;
  /** collapsed layer-manager groups (persisted user setting) */
  groupCollapsed: Record<string, boolean>;
  toggleGroup: (group: string) => void;
  /** derived map overlays (user toggles, persisted): signal hotspots,
   *  chokepoint reference points, trade-route reference lines, instability fill */
  derivedLayers: { hotspots: boolean; chokepoints: boolean; tradeRoutes: boolean; instability: boolean; sanctions: boolean; satellites: boolean };
  toggleDerived: (key: 'hotspots' | 'chokepoints' | 'tradeRoutes' | 'instability' | 'sanctions' | 'satellites') => void;
  /** derived country alert-level fill (user toggle, persisted) */
  showAlertLevels: boolean;
  /** static conflict-zone country names; loaded once, never persisted */
  conflictZones: string[] | null;
  /** static sanctions-program country lists; loaded once, never persisted */
  sanctions: { comprehensive: string[]; sectoral: string[] } | null;
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
  /** bottom-dock news/crypto snapshots; modes are real, never faked */
  dockNews: { region: string; articles: NewsArticle[]; mode: DataMode; error: string | null };
  dockCrypto: { coins: CoinRow[]; mode: DataMode; error: string | null };
  /** bottom dock open/collapsed (persisted user setting) */
  dockOpen: boolean;
  /** user-curated report workspace; citations frozen at pin time */
  dossier: Dossier;
  /** optional BYO-key AI analyst; local-rules fallback is always available */
  analyst: { provider: AnalystProvider | null; apiKey: string | null; baseUrl: string | null; messages: AnalystMessage[] };
  /** optional NASA FIRMS MAP_KEY (BYO, stored locally); enables the WMS
   *  hotspot overlay — a rendered raster, never itemized events */
  firmsKey: string | null;

  toggleLayer: (id: string) => void;
  toggleSource: (id: string) => void;
  addMonitor: (term: string) => void;
  removeMonitor: (id: string) => void;
  select: (e: GeoEvent | null) => void;
  setMobileRail: (r: 'left' | 'right' | null) => void;
  toggleRail: (side: 'left' | 'right') => void;
  flyTo: (center: [number, number], zoom: number) => void;
  setViewBounds: (b: ViewBounds | null) => void;
  setProjection: (p: MapProjection) => void;
  setShowTerminator: (on: boolean) => void;
  setBasemap: (b: Basemap) => void;
  setGeoWatching: (on: boolean) => void;
  setGeoPos: (pos: GeoSelf['pos'], error: string | null) => void;
  setShowAlertLevels: (on: boolean) => void;
  loadConflictZones: () => Promise<void>;
  loadSanctions: () => Promise<void>;
  /** in-view OSM Overpass military-bases refresh (only when its layer is on) */
  refreshMilitary: () => Promise<void>;
  /** in-view airplanes.live aircraft refresh (only when its layer is on) */
  refreshAviation: () => Promise<void>;
  /** parsed CelesTrak TLE sets; loaded once per session on toggle-on, never persisted */
  satTles: TleSet[] | null;
  loadSatellites: () => Promise<void>;
  /** the SGP4 worker crashed (uncaught exception) — surface it as an honest
   *  offline provider row instead of leaving satellites silently frozen */
  setSatWorkerError: (msg: string) => void;
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
  setDockRegion: (region: string) => void;
  refreshDock: () => Promise<void>;
  toggleDock: () => void;
  setFirmsKey: (key: string | null) => void;
  checkFirmsHealth: () => Promise<void>;
}

function providerStub(meta: { id: string; name: string; license: string; homepage: string }): ProviderHealth {
  return { id: meta.id, name: meta.name, status: 'loading', lastSuccessAt: null, latencyMs: null, itemCount: 0, error: null, license: meta.license, homepage: meta.homepage };
}

const DEFAULT_LAYERS: LayerDef[] = [
  { id: 'earthquakes', name: 'Earthquakes (M2.5+, 24h)', group: '🌋 Natural events', enabled: true, providerId: 'usgs', eventTypes: ['earthquake'], color: '#45e0b0' },
  { id: 'wildfires', name: 'Wildfires', group: '🌋 Natural events', enabled: true, providerId: 'eonet', eventTypes: ['wildfires'], color: '#ff7a3c' },
  { id: 'volcanoes', name: 'Volcanoes', group: '🌋 Natural events', enabled: true, providerId: 'eonet', eventTypes: ['volcanoes'], color: '#ff5a52' },
  { id: 'severe-storms', name: 'Severe storms', group: '🌋 Natural events', enabled: true, providerId: 'eonet', eventTypes: ['severeStorms'], color: '#6db3ff' },
  { id: 'other-natural', name: 'Other natural events', group: '🌋 Natural events', enabled: false, providerId: 'eonet', eventTypes: [], catchAll: true, color: '#b39ddb' },
  { id: 'weather-alerts', name: 'Weather alerts (US · NWS)', group: '⚠ Advisories', enabled: true, providerId: 'nws', eventTypes: ['weather-alert'], color: '#ffe066' },
  { id: 'disaster-alerts', name: 'Disaster alerts (GDACS)', group: '⚠ Advisories', enabled: true, providerId: 'gdacs', eventTypes: ['disaster-alert'], color: '#f06e9c' },
  { id: 'nuclear-plants', name: 'Nuclear power plants', group: '🏗 Infrastructure', enabled: true, providerId: 'power-plants', eventTypes: ['nuclear-plant'], color: '#ffb703' },
  { id: 'launch-sites', name: 'Space launch sites', group: '🏗 Infrastructure', enabled: true, providerId: 'launch-sites', eventTypes: ['launch-site'], color: '#00d4ff' },
  { id: 'econ-centers', name: 'Economic centers (exchanges)', group: '🏗 Infrastructure', enabled: true, providerId: 'econ-centers', eventTypes: ['econ-center'], color: '#ffd166' },
  { id: 'ai-datacenters', name: 'AI data centers', group: '🏗 Infrastructure', enabled: true, providerId: 'ai-datacenters', eventTypes: ['ai-datacenter'], color: '#9d7bff' },
  { id: 'nuclear-fuel', name: 'Nuclear fuel-cycle sites', group: '🏗 Infrastructure', enabled: true, providerId: 'nuclear-fuel', eventTypes: ['nuclear-fuel-site'], color: '#ff9e3d' },
  // default OFF: in-view Overpass query only runs when the user opts in
  { id: 'military-bases', name: 'Military bases (OSM)', group: '🏛 Military', enabled: false, providerId: 'osm-military', eventTypes: ['military-base'], color: '#c08bff' },
  // default OFF: in-view airplanes.live query only runs when the user opts in
  { id: 'aviation', name: 'Aircraft (live ADS-B)', group: '✈ Transport', enabled: false, providerId: 'airplanes-live', eventTypes: ['aircraft'], color: '#7ec8ff' },
];

// Module-level in-flight guards for the two in-view refreshers below. Neither
// provider is in FETCHERS, so nothing else ever clears a 'loading' provider
// status — using that status as the in-flight check would deadlock the very
// first fetch after the layer is enabled at an already-zoomed-in view (the
// stub starts 'loading' and stays there). A plain boolean avoids that.
let aviationInFlight = false;
let militaryInFlight = false;

const FETCHERS: Record<string, (signal?: AbortSignal) => ReturnType<typeof fetchUsgs>> = {
  usgs: fetchUsgs,
  eonet: fetchEonet,
  nws: fetchNws,
  gdacs: fetchGdacs,
  'power-plants': fetchPowerPlants,
  'launch-sites': fetchLaunchSites,
  'econ-centers': fetchEconCenters,
  'ai-datacenters': fetchAiDatacenters,
  'nuclear-fuel': fetchNuclearFuelSites,
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      layers: DEFAULT_LAYERS,
      providers: {
        usgs: providerStub(USGS_META), eonet: providerStub(EONET_META), nws: providerStub(NWS_META),
        gdacs: providerStub(GDACS_META), markets: providerStub(MARKETS_META),
        gdelt: providerStub(GDELT_META),
        'power-plants': providerStub(POWER_PLANTS_META), 'launch-sites': providerStub(LAUNCH_SITES_META),
        'econ-centers': providerStub(ECON_CENTERS_META), 'ai-datacenters': providerStub(AI_DATACENTERS_META),
        'nuclear-fuel': providerStub(NUCLEAR_FUEL_META), 'osm-military': providerStub(OSM_MILITARY_META),
        'airplanes-live': providerStub(AVIATION_META),
      },
      sources: {
        usgs: true, eonet: true, nws: true, gdacs: true, markets: true, gdelt: true,
        'power-plants': true, 'launch-sites': true, 'econ-centers': true, 'ai-datacenters': true, 'nuclear-fuel': true,
        'osm-military': true, 'airplanes-live': true,
      },
      monitors: [],
      events: [],
      selected: null,
      mobileRail: null,
      railCollapsed: { left: false, right: false },
      mapCmd: null,
      viewBounds: null,
      projection: '2d',
      showTerminator: false,
      basemap: 'vivid',
      geo: { watching: false, pos: null, error: null },
      groupCollapsed: {},
      derivedLayers: { hotspots: true, chokepoints: true, tradeRoutes: false, instability: false, sanctions: false, satellites: false },
      showAlertLevels: true,
      satTles: null,
      conflictZones: null,
      sanctions: null,
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
      dockNews: { region: 'World', articles: [], mode: 'loading', error: null },
      dockCrypto: { coins: [], mode: 'loading', error: null },
      // phones start with the dock folded so the map isn't buried; a persisted
      // user choice overrides this default on rehydrate
      dockOpen: !window.matchMedia('(max-width: 860px)').matches,
      dossier: { title: 'Terra Watch dossier', items: [] },
      analyst: { provider: null, apiKey: null, baseUrl: null, messages: [] },
      firmsKey: null,

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
      toggleDerived: (key) =>
        set((s) => ({ derivedLayers: { ...s.derivedLayers, [key]: !s.derivedLayers[key] } })),
      toggleGroup: (group) =>
        set((s) => ({ groupCollapsed: { ...s.groupCollapsed, [group]: !s.groupCollapsed[group] } })),
      setShowAlertLevels: (on) => set({ showAlertLevels: on }),
      toggleDock: () => set((s) => ({ dockOpen: !s.dockOpen })),
      setDockRegion: (region) => {
        set((s) => ({ dockNews: { ...s.dockNews, region, mode: 'loading' } }));
        void get().refreshDock();
      },
      refreshDock: async () => {
        const region = get().dockNews.region;
        const query = REGION_QUERIES[region] ?? REGION_QUERIES['World'];
        const [news, coins] = await Promise.all([fetchGdeltNews(query), fetchTopCoins()]);
        set((s) => ({
          dockNews: { region: s.dockNews.region, articles: news.articles, mode: news.mode, error: news.error },
          dockCrypto: { coins: coins.coins, mode: coins.mode, error: coins.error },
          providers: {
            ...s.providers,
            gdelt: {
              ...s.providers.gdelt,
              status: news.mode,
              lastSuccessAt: news.mode === 'live' ? Date.now() : s.providers.gdelt.lastSuccessAt,
              latencyMs: news.latencyMs,
              itemCount: news.articles.length,
              error: news.error,
            },
          },
        }));
      },
      loadConflictZones: async () => {
        if (get().conflictZones) return;
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}data/conflict_zones.json`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const j = (await res.json()) as { countries: string[] };
          set({ conflictZones: j.countries });
        } catch {
          set({ conflictZones: [] }); // no fill rather than a stale/wrong fill
        }
      },
      refreshMilitary: async () => {
        const { viewBounds, layers, sources } = get();
        if (!(sources[OSM_MILITARY_META.id] ?? true)) return;
        if (!layers.some((l) => l.providerId === OSM_MILITARY_META.id && l.enabled)) return;
        if (!viewBounds) return;
        const [w, s, e, n] = viewBounds;
        if (e - w > 60 || n - s > 40) {
          // a world-sized Overpass query would time out or hammer the public
          // endpoint — an honest error beats silently showing nothing
          set((st) => ({
            providers: {
              ...st.providers,
              [OSM_MILITARY_META.id]: { ...st.providers[OSM_MILITARY_META.id], status: 'offline', itemCount: 0, error: 'view too wide — zoom in to load bases' },
            },
          }));
          return;
        }
        if (militaryInFlight) return; // one in-flight query at a time
        militaryInFlight = true;
        set((st) => ({
          providers: { ...st.providers, [OSM_MILITARY_META.id]: { ...st.providers[OSM_MILITARY_META.id], status: 'loading' } },
        }));
        try {
          const r = await fetchMilitaryBases([s, w, n, e]);
          set((st) => ({
            events: [...st.events.filter((ev) => ev.sourceId !== OSM_MILITARY_META.id), ...r.events],
            providers: {
              ...st.providers,
              [OSM_MILITARY_META.id]: {
                ...st.providers[OSM_MILITARY_META.id],
                status: r.mode, latencyMs: r.latencyMs, itemCount: r.events.length, error: r.error,
                lastSuccessAt: r.mode === 'live' ? Date.now() : st.providers[OSM_MILITARY_META.id].lastSuccessAt,
              },
            },
          }));
        } finally {
          militaryInFlight = false;
        }
      },
      refreshAviation: async () => {
        const { viewBounds, layers, sources } = get();
        if (!(sources[AVIATION_META.id] ?? true)) return;
        if (!layers.some((l) => l.providerId === AVIATION_META.id && l.enabled)) return;
        if (!viewBounds) return;
        const [w, s, e, n] = viewBounds;
        if (e - w > 12 || n - s > 8) {
          // cheap pre-check: an obviously world-sized view skips the haversine
          // call below and fails fast with the same honest error
          set((st) => ({
            providers: {
              ...st.providers,
              [AVIATION_META.id]: { ...st.providers[AVIATION_META.id], status: 'offline', itemCount: 0, error: 'view too wide — zoom in to load aircraft' },
            },
          }));
          return;
        }
        // authoritative check: the API is point+radius capped at 250 nm, but
        // the circumscribed-circle radius for a 12°×8° bbox can exceed that
        // (diagonal > either linear dimension — up to ~432 nm at the equator).
        // Refuse honestly here instead of letting fetchAircraft's clamp
        // silently under-cover the requested view.
        if (requiredRadiusNm([s, w, n, e]) > 250) {
          set((st) => ({
            providers: {
              ...st.providers,
              [AVIATION_META.id]: { ...st.providers[AVIATION_META.id], status: 'offline', itemCount: 0, error: 'view too wide — zoom in to load aircraft' },
            },
          }));
          return;
        }
        if (aviationInFlight) return; // one in-flight query at a time
        aviationInFlight = true;
        set((st) => ({
          providers: { ...st.providers, [AVIATION_META.id]: { ...st.providers[AVIATION_META.id], status: 'loading' } },
        }));
        try {
          const r = await fetchAircraft([s, w, n, e]);
          set((st) => ({
            events: [...st.events.filter((ev) => ev.sourceId !== AVIATION_META.id), ...r.events],
            providers: {
              ...st.providers,
              [AVIATION_META.id]: {
                ...st.providers[AVIATION_META.id],
                status: r.mode, latencyMs: r.latencyMs, itemCount: r.events.length, error: r.error,
                lastSuccessAt: r.mode === 'live' ? Date.now() : st.providers[AVIATION_META.id].lastSuccessAt,
              },
            },
          }));
        } finally {
          aviationInFlight = false;
        }
      },
      loadSatellites: async () => {
        const { satTles, providers } = get();
        if (satTles) return; // TLEs stay useful for days — one fetch per session
        if (providers[CELESTRAK_META.id]?.status === 'loading') return;
        set((st) => ({
          providers: {
            ...st.providers,
            [CELESTRAK_META.id]: {
              id: CELESTRAK_META.id, name: CELESTRAK_META.name, status: 'loading',
              lastSuccessAt: null, latencyMs: null, itemCount: null, error: null,
              license: CELESTRAK_META.license, homepage: CELESTRAK_META.homepage,
            },
          },
        }));
        const r = await fetchTles();
        set((st) => ({
          satTles: r.sats.length > 0 ? r.sats : null,
          providers: {
            ...st.providers,
            [CELESTRAK_META.id]: {
              ...st.providers[CELESTRAK_META.id],
              status: r.mode, latencyMs: r.latencyMs,
              itemCount: r.sats.length > 0 ? r.sats.length : null,
              error: r.error,
              lastSuccessAt: r.mode === 'live' ? Date.now() : null,
            },
          },
        }));
      },
      setSatWorkerError: (msg) =>
        set((s) => ({
          providers: {
            ...s.providers,
            [CELESTRAK_META.id]: { ...(s.providers[CELESTRAK_META.id] ?? providerStub(CELESTRAK_META)), status: 'offline', itemCount: null, error: msg },
          },
        })),
      loadSanctions: async () => {
        if (get().sanctions) return;
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}data/sanctions.json`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const j = (await res.json()) as { comprehensive: string[]; sectoral: string[] };
          set({ sanctions: { comprehensive: j.comprehensive, sectoral: j.sectoral } });
        } catch {
          set({ sanctions: { comprehensive: [], sectoral: [] } }); // no fill rather than a wrong fill
        }
      },
      toggleRail: (side) =>
        set((s) => ({ railCollapsed: { ...s.railCollapsed, [side]: !s.railCollapsed[side] } })),
      flyTo: (center, zoom) => set((s) => ({ mapCmd: { seq: (s.mapCmd?.seq ?? 0) + 1, center, zoom } })),
      setViewBounds: (b) => set({ viewBounds: b }),
      setProjection: (p) => set({ projection: p }),
      setShowTerminator: (on) => set({ showTerminator: on }),
      setBasemap: (b) => set({ basemap: b }),
      // turning the watch off also drops the fix — no stale pin, nothing kept
      setGeoWatching: (on) =>
        set((s) => ({ geo: on ? { ...s.geo, watching: true, error: null } : { watching: false, pos: null, error: null } })),
      setGeoPos: (pos, error) => set((s) => ({ geo: { ...s.geo, pos, error } })),

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
        // reference objects (aircraft/satellite/registry positions) are
        // position snapshots, not events — churning them would poison the
        // added/removed delta the same way they're already excluded from
        // the timeline and signals
        const events = get().events.filter((e) => !e.reference);
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
        const current = get().events.filter((e) => !e.reference);
        set({ snapshotDelta: diffSnapshot(snap, current) });
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

      setFirmsKey: (key) => {
        set((s) => {
          if (key) return { firmsKey: key };
          // key removed: drop the provider health row too — a keyless FIRMS
          // entry would be a permanent OFF/offline row for a feature the
          // user hasn't opted into
          const providers = { ...s.providers };
          delete providers[FIRMS_META.id];
          return { firmsKey: null, providers };
        });
        if (key) void get().checkFirmsHealth();
      },

      checkFirmsHealth: async () => {
        const { firmsKey, sources } = get();
        if (!firmsKey || !(sources[FIRMS_META.id] ?? true)) return;
        set((s) => ({
          providers: {
            ...s.providers,
            [FIRMS_META.id]: {
              ...(s.providers[FIRMS_META.id] ?? providerStub(FIRMS_META)),
              status: 'loading' as const,
            },
          },
        }));
        const r = await checkFirms(firmsKey);
        set((s) => ({
          providers: {
            ...s.providers,
            [FIRMS_META.id]: {
              id: FIRMS_META.id, name: FIRMS_META.name,
              // reachability, not key validity — the WMS serves tiles for any
              // key, so 'live' means "NASA's WMS is up and answering"
              status: r.ok ? 'live' as const : 'offline' as const,
              lastSuccessAt: r.ok ? Date.now() : s.providers[FIRMS_META.id]?.lastSuccessAt ?? null,
              // a rendered overlay has no countable items — null omits the count
              latencyMs: r.latencyMs, itemCount: null, error: r.error,
              license: FIRMS_META.license, homepage: FIRMS_META.homepage,
            },
          },
        }));
      },

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
        void get().checkFirmsHealth();
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
        // static reference registries truthfully report 'cache' forever; they
        // must not drag an otherwise-live board down to DEMO/SAMPLE
        const liveFeeds = activeP.filter((p) => p.status !== 'cache');
        if (liveFeeds.length === 0) return 'cache';
        if (liveFeeds.every((p) => p.status === 'live')) return 'live';
        if (liveFeeds.some((p) => p.status === 'offline')) return 'offline';
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
        basemap: s.basemap,
        railCollapsed: s.railCollapsed,
        showAlertLevels: s.showAlertLevels,
        groupCollapsed: s.groupCollapsed,
        derivedLayers: s.derivedLayers,
        dockOpen: s.dockOpen,
        layerEnabled: Object.fromEntries(s.layers.map((l) => [l.id, l.enabled])),
        // graph nodes and dossier items are deliberate user-curated workspaces
        // (like monitors), not live-data caches, so they're persisted the same
        // way — never raw fetch results.
        graph: s.graph,
        dossier: s.dossier,
        // only the BYO-key settings persist — chat messages are transient,
        // like fetched data
        analystSettings: { provider: s.analyst.provider, apiKey: s.analyst.apiKey, baseUrl: s.analyst.baseUrl },
        firmsKey: s.firmsKey,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as {
          sources?: Record<string, boolean>;
          monitors?: Monitor[];
          projection?: MapProjection;
          showTerminator?: boolean;
          basemap?: Basemap;
          railCollapsed?: { left: boolean; right: boolean };
          showAlertLevels?: boolean;
          groupCollapsed?: Record<string, boolean>;
          derivedLayers?: { hotspots: boolean; chokepoints: boolean; tradeRoutes: boolean; instability: boolean; sanctions: boolean; satellites: boolean };
          dockOpen?: boolean;
          layerEnabled?: Record<string, boolean>;
          graph?: GraphState;
          dossier?: Dossier;
          analystSettings?: { provider: AnalystProvider | null; apiKey: string | null; baseUrl: string | null };
          firmsKey?: string | null;
        };
        return {
          ...current,
          sources: { ...current.sources, ...(p.sources ?? {}) },
          monitors: p.monitors ?? current.monitors,
          projection: p.projection ?? current.projection,
          showTerminator: p.showTerminator ?? current.showTerminator,
          basemap: p.basemap ?? current.basemap,
          railCollapsed: p.railCollapsed ?? current.railCollapsed,
          showAlertLevels: p.showAlertLevels ?? current.showAlertLevels,
          groupCollapsed: p.groupCollapsed ?? current.groupCollapsed,
          // spread: persisted state from an older version may lack newer keys
          derivedLayers: { ...current.derivedLayers, ...p.derivedLayers },
          // phones always start folded — a persisted `true` is usually just the
          // old desktop default, and an open dock buries the map on a phone;
          // the in-session toggle still works normally
          dockOpen: window.matchMedia('(max-width: 860px)').matches ? false : (p.dockOpen ?? current.dockOpen),
          layers: current.layers.map((l) => (p.layerEnabled && l.id in p.layerEnabled ? { ...l, enabled: p.layerEnabled[l.id] } : l)),
          graph: p.graph ?? current.graph,
          dossier: p.dossier ?? current.dossier,
          analyst: p.analystSettings ? { ...current.analyst, ...p.analystSettings } : current.analyst,
          firmsKey: p.firmsKey ?? current.firmsKey,
        };
      },
    },
  ),
);
