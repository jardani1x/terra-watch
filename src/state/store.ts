import { create } from 'zustand';
import type { DataMode, GeoEvent, ProviderHealth } from '../lib/providers/types';
import { fetchUsgs, USGS_META } from '../lib/providers/usgs';

export interface LayerDef {
  id: string;
  name: string;
  group: string;
  enabled: boolean;
  providerId: string;
}

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
  /** Overall mode shown in the status bar, derived from enabled providers. */
  overallMode: () => DataMode;
}

const initialProviders: Record<string, ProviderHealth> = {
  usgs: {
    id: USGS_META.id,
    name: USGS_META.name,
    status: 'loading',
    lastSuccessAt: null,
    latencyMs: null,
    itemCount: 0,
    error: null,
    license: USGS_META.license,
    homepage: USGS_META.homepage,
  },
};

export const useStore = create<AppState>((set, get) => ({
  layers: [
    { id: 'earthquakes', name: 'Earthquakes (M2.5+, 24h)', group: 'Natural events', enabled: true, providerId: 'usgs' },
  ],
  providers: initialProviders,
  events: [],
  selected: null,
  mobileRail: null,

  toggleLayer: (id) =>
    set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)) })),

  select: (e) => set({ selected: e }),
  setMobileRail: (r) => set({ mobileRail: r }),

  refreshAll: async () => {
    set((s) => ({ providers: { ...s.providers, usgs: { ...s.providers.usgs, status: 'loading' } } }));
    const r = await fetchUsgs();
    set((s) => ({
      events: [...s.events.filter((e) => e.sourceId !== 'usgs'), ...r.events],
      providers: {
        ...s.providers,
        usgs: {
          ...s.providers.usgs,
          status: r.mode,
          latencyMs: r.latencyMs,
          itemCount: r.events.length,
          error: r.error,
          lastSuccessAt: r.mode === 'live' ? Date.now() : s.providers.usgs.lastSuccessAt,
        },
      },
    }));
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
