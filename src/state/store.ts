import { create } from 'zustand';
import type { DataMode, GeoEvent, ProviderHealth } from '../lib/providers/types';
import { fetchUsgs, USGS_META } from '../lib/providers/usgs';
import { fetchEonet, EONET_META } from '../lib/providers/eonet';
import { isEventVisible, type LayerDef } from '../lib/layers';

export type { LayerDef } from '../lib/layers';

interface AppState {
  layers: LayerDef[];
  providers: Record<string, ProviderHealth>;
  events: GeoEvent[];
  selected: GeoEvent | null;
  mobileRail: 'left' | 'right' | null;

  toggleLayer: (id: string) => void;
  select: (e: GeoEvent | null) => void;
  setMobileRail: (r: 'left' | 'right' | null) => void;
  refreshAll: () => Promise<void>;
  visibleEvents: () => GeoEvent[];
  overallMode: () => DataMode;
}

function providerStub(meta: { id: string; name: string; license: string; homepage: string }): ProviderHealth {
  return { id: meta.id, name: meta.name, status: 'loading', lastSuccessAt: null, latencyMs: null, itemCount: 0, error: null, license: meta.license, homepage: meta.homepage };
}

export const useStore = create<AppState>((set, get) => ({
  layers: [
    { id: 'earthquakes', name: 'Earthquakes (M2.5+, 24h)', group: 'Natural events', enabled: true, providerId: 'usgs', eventTypes: ['earthquake'], color: '#45e0b0' },
    { id: 'wildfires', name: 'Wildfires', group: 'Natural events', enabled: true, providerId: 'eonet', eventTypes: ['wildfires'], color: '#ff7a3c' },
    { id: 'volcanoes', name: 'Volcanoes', group: 'Natural events', enabled: true, providerId: 'eonet', eventTypes: ['volcanoes'], color: '#ff5a52' },
    { id: 'severe-storms', name: 'Severe storms', group: 'Natural events', enabled: true, providerId: 'eonet', eventTypes: ['severeStorms'], color: '#6db3ff' },
    { id: 'other-natural', name: 'Other natural events', group: 'Natural events', enabled: false, providerId: 'eonet', eventTypes: [], catchAll: true, color: '#b39ddb' },
  ],
  providers: { usgs: providerStub(USGS_META), eonet: providerStub(EONET_META) },
  events: [],
  selected: null,
  mobileRail: null,

  toggleLayer: (id) =>
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)) })),
  select: (e) => set({ selected: e }),
  setMobileRail: (r) => set({ mobileRail: r }),

  refreshAll: async () => {
    set((s) => ({
      providers: {
        ...s.providers,
        usgs: { ...s.providers.usgs, status: 'loading' },
        eonet: { ...s.providers.eonet, status: 'loading' },
      },
    }));
    const [usgs, eonet] = await Promise.all([fetchUsgs(), fetchEonet()]);
    set((s) => ({
      events: [
        ...s.events.filter((e) => e.sourceId !== 'usgs' && e.sourceId !== 'eonet'),
        ...usgs.events,
        ...eonet.events,
      ],
      providers: {
        ...s.providers,
        usgs: { ...s.providers.usgs, status: usgs.mode, latencyMs: usgs.latencyMs, itemCount: usgs.events.length, error: usgs.error, lastSuccessAt: usgs.mode === 'live' ? Date.now() : s.providers.usgs.lastSuccessAt },
        eonet: { ...s.providers.eonet, status: eonet.mode, latencyMs: eonet.latencyMs, itemCount: eonet.events.length, error: eonet.error, lastSuccessAt: eonet.mode === 'live' ? Date.now() : s.providers.eonet.lastSuccessAt },
      },
    }));
  },

  visibleEvents: () => {
    const { events, layers } = get();
    return events.filter((e) => isEventVisible(e, layers));
  },

  overallMode: () => {
    const enabledProviderIds = new Set(get().layers.filter((l) => l.enabled).map((l) => l.providerId));
    const active = Object.values(get().providers).filter((p) => enabledProviderIds.has(p.id));
    if (active.length === 0) return 'offline';
    if (active.some((p) => p.status === 'loading')) return 'loading';
    if (active.every((p) => p.status === 'live')) return 'live';
    if (active.some((p) => p.status === 'offline')) return 'offline';
    return 'mock';
  },
}));
