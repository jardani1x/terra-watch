// ============================================================
//  auth.js — optional Supabase auth + cloud-synced tracking secrets
//  Wraps Supabase Auth (Google OAuth) and a single `user_secrets` row per user
//  so a signed-in user's tracking API keys follow them across devices instead of
//  living only in this browser's localStorage. Supabase-js is loaded lazily from
//  esm.sh ONLY when configured, so the no-build/static model and offline path are
//  untouched. When Supabase is not configured (see js/config.js), initAuth()
//  returns a no-op stub with `configured:false` and the app degrades to its
//  original localStorage-only behavior. Civilian SA tool — keys are personal.
// ============================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from '../config.js';

/** Lazily-loaded Supabase client (created once on first init when configured). */
let client = null;

/** Re-export so callers can branch without re-reading config. */
export const authConfigured = isSupabaseConfigured();

/**
 * Initialize auth. Safe to call when unconfigured (returns an inert stub).
 * @param {Object} opts
 * @param {(user:Object|null)=>void} [opts.onChange]  fired on sign-in / sign-out / initial session
 * @returns {Promise<{
 *   configured:boolean,
 *   user:()=>(Object|null),
 *   signIn:()=>Promise<void>,
 *   signOut:()=>Promise<void>,
 *   loadSecrets:()=>Promise<Object>,
 *   saveSecrets:(secrets:Object)=>Promise<void>,
 * }>}
 */
export async function initAuth({ onChange } = {}) {
  if (!authConfigured) return stub();

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,   // consume the OAuth hash on redirect-back
      },
    });
  } catch (err) {
    console.warn('[auth] Supabase failed to load — falling back to local-only.', err);
    return stub();
  }

  let current = null;

  // Seed from any existing session, then subscribe to changes.
  try {
    const { data } = await client.auth.getSession();
    current = data?.session?.user || null;
  } catch { /* treat as signed-out */ }

  client.auth.onAuthStateChange((_event, session) => {
    current = session?.user || null;
    onChange?.(current);
  });

  // Announce the initial state so the UI paints correctly on load.
  onChange?.(current);

  return {
    configured: true,
    user: () => current,
    async signIn() {
      // Return to this exact page (no SPA route) after Google sign-in.
      const redirectTo = location.origin + location.pathname;
      await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    },
    async signOut() {
      await client.auth.signOut();
    },
    async loadSecrets() {
      if (!current) return {};
      const { data, error } = await client
        .from('user_secrets')
        .select('secrets')
        .eq('user_id', current.id)
        .maybeSingle();
      if (error) { console.warn('[auth] loadSecrets failed', error); return {}; }
      return data?.secrets || {};
    },
    async saveSecrets(secrets) {
      if (!current) return;
      const { error } = await client
        .from('user_secrets')
        .upsert(
          { user_id: current.id, secrets, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
      if (error) console.warn('[auth] saveSecrets failed', error);
    },
  };
}

/** Inert API used whenever Supabase is unconfigured or fails to load. */
function stub() {
  return {
    configured: false,
    user: () => null,
    async signIn() {},
    async signOut() {},
    async loadSecrets() { return {}; },
    async saveSecrets() {},
  };
}
