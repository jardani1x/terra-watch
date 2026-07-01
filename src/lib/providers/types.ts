// ---- Core ontology + provider types (Slice 1; extended in later slices) ----

/** How fresh / trustworthy the data currently on screen is. Never faked. */
export type DataMode = 'live' | 'cache' | 'mock' | 'offline' | 'loading';

/** A normalized geospatial event. The ontology grows in Slice 2; this is the
 *  minimum needed to plot + inspect a source-backed point. */
export interface GeoEvent {
  id: string;
  /** ontology event type, e.g. 'earthquake' */
  type: string;
  lon: number;
  lat: number;
  title: string;
  /** epoch ms */
  time: number;
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
  itemCount: number;
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
