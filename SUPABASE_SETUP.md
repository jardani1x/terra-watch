# Cloud sync setup — Supabase Auth (Google) on GitHub Pages or Netlify

TERRA-WATCH works fully offline with no setup: tracking API keys (OpenSky /
AISStream) are stored in your browser's `localStorage`. This is **optional** —
it adds "Sign in with Google" so your tracking keys sync across devices,
stored server-side and protected by Row-Level Security.

Leave `js/config.js` blank to keep cloud sync off — the app behaves exactly as
before (local-only, no sign-in UI).

## What's public vs. secret

- **Public (safe to commit):** the Supabase **project URL** and **anon key** in
  `js/config.js`. The anon key is designed to ship in the browser; RLS is what
  protects the data.
- **Never committed:** your personal OpenSky / AISStream keys. Those are entered
  in the app and stored either in `localStorage` or (when signed in) in your own
  RLS-protected `user_secrets` row.

## 1. Create the Supabase project

1. Create a project at <https://supabase.com>.
2. Project Settings → **API** → copy the **Project URL** and **anon public** key.
3. Paste them into `js/config.js`:

   ```js
   export const SUPABASE_URL = 'https://YOUR-REF.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...your-anon-key...';
   ```

## 2. Create the secrets table + RLS

Supabase → **SQL editor** → run:

```sql
create table public.user_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  secrets jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.user_secrets enable row level security;
create policy "own-secrets-select" on public.user_secrets for select using (auth.uid() = user_id);
create policy "own-secrets-insert" on public.user_secrets for insert with check (auth.uid() = user_id);
create policy "own-secrets-update" on public.user_secrets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Each user can only read/write their own row; nobody can see another user's keys.

## 3. Enable Google sign-in

1. Supabase → **Authentication → Providers → Google** → enable.
2. In Google Cloud Console, create an **OAuth 2.0 Client ID** (Web application).
3. Paste the Google **client ID** and **client secret** into Supabase's Google
   provider settings.
4. In Google Cloud, set the **Authorized redirect URI** to the callback URL
   Supabase shows (looks like `https://YOUR-REF.supabase.co/auth/v1/callback`).

## 4. Allow your site's redirect URL

After Google sign-in the app returns to `location.origin + location.pathname`
(see `js/auth/auth.js`), and Supabase only honors redirect targets you allowlist.

Supabase → **Authentication → URL Configuration** → add **every** URL you deploy
to under **Redirect URLs**, with the exact path and trailing slash:

- GitHub Pages (this repo): **`https://jardani1x.github.io/terra-watch/`**
- Local testing: **`http://localhost:8080`** (or `http://localhost:8080/`)
- Netlify (optional): `https://your-site.netlify.app`

Set **Site URL** to your primary deployment (e.g. the Pages URL above).

## 5. Deploy

The repo is the deployable artifact — no build step. Pick either host.

### GitHub Pages (no Netlify needed)

The app already serves on Pages as-is (`.nojekyll` forces verbatim assets).
Supabase Google OAuth works on Pages **as long as the Pages URL is in the
Supabase redirect allowlist** (§4). The OAuth redirect lands back on
`/terra-watch/`; `detectSessionInUrl` consumes the auth hash on reload and the
session persists in `localStorage`. Nothing Pages-specific to configure beyond
the allowlist.

### Netlify (optional)

Only needed if you want SPA-fallback routing or deploy previews:

1. Netlify → **Add new site → Import from Git**, pick this repo.
2. Build command: **(empty)**. Publish directory: **`.`**.
3. `netlify.toml` already sets `publish = "."` and the SPA fallback, so no extra
   config is needed.

That's it. When signed in, the Tracking workspace's "API credentials" panel saves
to your cloud row; when signed out (or unconfigured) it stays local-only, and
signing out clears the cloud-loaded keys from the device.
