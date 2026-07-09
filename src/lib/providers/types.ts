// ---- Core ontology + provider types (Slice 1; extended in later slices) ----

/** How fresh / trustworthy the data currently on screen is. Never faked. */
export type DataMode = 'live' | 'cache' | 'mock' | 'offline' | 'loading';

/** A normalized geospatial event. The ontology grows in Slice 2; this is the
 *  minimum needed to plot + inspect a source-backed point. */
export interface GeoEvent {
  id: string;
  /** ontology event type, e.g. 'earthquake', 'wildfires', 'volcanoes' */
  type: string;
  /** human-readable category label, e.g. 'Wildfires' */
  category?: string;
  lon: number;
  lat: number;
  title: string;
  /** epoch ms */
  time: number;
  /** true for static reference registries (vendored infrastructure): plotted
   *  on the map but excluded from time-based views — timeline, playback
   *  cutoff, co-location signals — because `time` is the fetch time, not a
   *  real event time */
  reference?: boolean;
  magnitude?: number;
  /** provider id this came from */
  sourceId: string;
  /** freeform provider properties, preserved for the inspector */
  props: Record<string, string | number | undefined>;
  /** deep link back to the authoritative record */
  url?: string;
}

/** Live health/freshness for one data provider. Surfaced in ProviderHealthBar. */
export interface ProviderHealth {
  id: string;
  name: string;
  status: DataMode;
  /** epoch ms of last successful fetch, or null */
  lastSuccessAt: number | null;
  latencyMs: number | null;
  /** null for providers with no countable items (e.g. a rendered raster
   *  overlay) — the health bar then omits the count instead of showing a
   *  misleading "0 items" */
  itemCount: number | null;
  error: string | null;
  /** attribution shown in the inspector source card */
  license: string;
  homepage: string;
}

export interface FetchResult {
  events: GeoEvent[];
  mode: DataMode;
  latencyMs: number;
  error: string | null;
}
