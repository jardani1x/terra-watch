// ============================================================
//  config.js — public runtime configuration
//  Holds the Supabase project URL + anon (public) key used for optional cloud
//  sync of tracking credentials. BOTH values are PUBLIC by design: the anon key
//  is meant to ship in the browser, and Row-Level Security (see SUPABASE_SETUP.md)
//  is what actually protects each user's data. These are the ONLY "secrets" that
//  are committed — real API keys (OpenSky / AISStream) never live here.
//
//  Leave both blank to keep TERRA-WATCH fully offline-capable: with no Supabase
//  configured the app behaves exactly as before — tracking keys stay in this
//  browser's localStorage and there is no sign-in.
// ============================================================

/** Supabase project URL, e.g. 'https://abcd1234.supabase.co'. Blank = cloud sync off. */
export const SUPABASE_URL = '';

/** Supabase anon/public key. Safe to ship; RLS protects the data. Blank = cloud sync off. */
export const SUPABASE_ANON_KEY = '';

/** @returns {boolean} true only when both Supabase values are present. */
export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
