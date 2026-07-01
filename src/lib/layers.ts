import type { GeoEvent } from './providers/types';

export interface LayerDef {
  id: string;
  name: string;
  group: string;
  enabled: boolean;
  providerId: string;
  /** event types this layer owns; empty + catchAll picks up the remainder */
  eventTypes: string[];
  /** claims any event from its provider not owned by a named layer */
  catchAll?: boolean;
  /** display color (hex) for this layer's markers */
  color: string;
}

/** Which layer owns an event: a named layer for its provider+type, else that
 *  provider's catch-all layer, else none. Single source of truth used by the
 *  map, the layer manager (counts), and visibility. */
export function layerIdForEvent(event: GeoEvent, layers: LayerDef[]): string | null {
  const sameProvider = layers.filter((l) => l.providerId === event.sourceId);
  const named = sameProvider.find((l) => !l.catchAll && l.eventTypes.includes(event.type));
  if (named) return named.id;
  return sameProvider.find((l) => l.catchAll)?.id ?? null;
}

export function isEventVisible(event: GeoEvent, layers: LayerDef[]): boolean {
  const id = layerIdForEvent(event, layers);
  return id != null && (layers.find((l) => l.id === id)?.enabled ?? false);
}

/** Count of loaded events per layer id. */
export function eventCounts(events: GeoEvent[], layers: LayerDef[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const l of layers) counts[l.id] = 0;
  for (const e of events) {
    const id = layerIdForEvent(e, layers);
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
