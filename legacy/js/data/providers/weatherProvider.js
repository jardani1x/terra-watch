// ============================================================
//  weatherProvider.js — real, key-less weather (Open-Meteo)
//  PRIVACY: this is the ONLY provider that takes coordinates. The caller passes
//  explicit lon/lat; querying the user's OWN position is gated behind an opt-in
//  in the UI. Sample points (market centers, tapped map points) are not private.
//  api.open-meteo.com is CORS-open and needs no key.
// ============================================================

import { fetchJSON } from './http.js';

/** @typedef {import('./types.js').WeatherPoint} WeatherPoint */

// Minimal WMO weather-code → label map (enough for a HUD summary).
const WMO = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Violent showers', 95: 'Thunderstorm', 96: 'Thunderstorm + hail',
};

/**
 * Current conditions at an explicit point.
 * @param {number} lon @param {number} lat
 * @returns {Promise<WeatherPoint>}
 */
export async function fetchWeather(lon, lat) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    `&current=temperature_2m,weather_code,wind_speed_10m&wind_speed_unit=kmh`;
  const json = await fetchJSON(url);
  const c = json.current || {};
  const code = c.weather_code ?? null;
  return {
    lon, lat,
    tempC: c.temperature_2m ?? null,
    windKmh: c.wind_speed_10m ?? null,
    code,
    summary: WMO[code] || 'Conditions',
    ts: c.time ? Date.parse(c.time) : Date.now(),
    source: 'Open-Meteo',
  };
}

export const weatherSummary = (code) => WMO[code] || 'Conditions';
