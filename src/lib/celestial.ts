/** Celestial configuration + the single astronomy time source.
 *
 *  Drives the map's client-side astronomy: the Sun marker at the subsolar
 *  point and the day/night terminator polygon (see terminator.ts) both derive
 *  from the same UTC instant so they can never disagree.
 *
 *  (The former three.js star/constellation overlay was retired when the
 *  Cesium "Satellite" view landed — Cesium renders a real sky natively.) */
export interface CelestialConfig {
  /** live UTC when true; `timeOverride` (for testing) when false */
  useCurrentTime: boolean;
  /** fixed instant used when useCurrentTime is false */
  timeOverride: Date | null;
  /** additive longitude nudge (degrees) — kept at 0; lets the subsolar point/
   *  terminator be nudged onto the basemap's prime meridian if ever needed */
  earthLongitudeOffset: number;
  /** how often the Sun marker + terminator are recomputed (ms) */
  astronomyUpdateIntervalMs: number;
  /** 0..1 glow strength of the surface Sun marker */
  sunGlowIntensity: number;
  /** dev aid: red dot + console line at the computed subsolar point */
  showDebugSubsolarPoint: boolean;
}

export const celestialConfig: CelestialConfig = {
  useCurrentTime: true,
  timeOverride: null,
  earthLongitudeOffset: 0,
  astronomyUpdateIntervalMs: 60_000,
  sunGlowIntensity: 0.35,
  showDebugSubsolarPoint: false,
};

/** The one astronomy clock: everything (terminator, Sun marker) reads this
 *  so both derive from the same instant and a test override affects all. */
export function getAstronomyTime(): Date {
  if (!celestialConfig.useCurrentTime && celestialConfig.timeOverride) {
    return celestialConfig.timeOverride;
  }
  return new Date();
}
