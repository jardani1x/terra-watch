import type { GeoEvent } from './providers/types';
import { computeCountryRisk } from './risk';

/** Derived country alert level. 'conflict' comes from the static
 *  conflict_zones.json (source-labeled); the rest derive from live GDACS
 *  weights via computeCountryRisk. Advisory, never a forecast. */
export type AlertLevel = 'conflict' | 'high' | 'elevated' | 'monitoring';

export const ALERT_COLORS: Record<AlertLevel, string> = {
  conflict: '#b3123d',
  high: '#ff5a52',
  elevated: '#ffb454',
  monitoring: '#ffe066',
};

export const ALERT_LABELS: Record<AlertLevel, string> = {
  conflict: 'Conflict zone',
  high: 'High alert',
  elevated: 'Elevated',
  monitoring: 'Monitoring',
};

/** score >= 6 high, >= 3 elevated, >= 1 monitoring; conflict list overrides. */
export function countryAlertLevels(events: GeoEvent[], conflictZones: string[]): Map<string, AlertLevel> {
  const out = new Map<string, AlertLevel>();
  for (const r of computeCountryRisk(events)) {
    out.set(r.country, r.score >= 6 ? 'high' : r.score >= 3 ? 'elevated' : 'monitoring');
  }
  for (const name of conflictZones) out.set(name, 'conflict');
  return out;
}
