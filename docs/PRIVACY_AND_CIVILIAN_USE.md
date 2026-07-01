# Privacy & Civilian Use

## Civilian use only

Terra Watch is a **civilian open-source-intelligence (OSINT) situational-awareness
and research tool**. It aggregates **public, licensed, or user-supplied** data.

It is **not**:
- an emergency-authority or life-safety data source,
- a targeting, weapon-tasking, or military C2 system,
- a surveillance tool for tracking individuals,
- a source of verdicts about people, groups, or "threats".

Always verify with official authorities before acting on anything shown here.

### Explicitly excluded features (by design, permanently)
Military/weapon targeting or tasking · private-person surveillance or
pattern-of-life · doxxing · people-watchlists · CDR/telecom/SIGINT ingestion ·
biometrics/facial recognition · predictive policing · any real classified data.
The v1 site's decorative "FOR OFFICIAL USE ONLY" military banner has been
**removed** — v2 uses civilian labels (Public OSINT, Demo data, Source
confidence, Advisory).

## Privacy model

- **No Terra Watch backend.** The app is a static site. All data is fetched
  **directly from public providers by your browser**. Nothing you view, toggle,
  select, or search is sent to a Terra Watch server (there isn't one).
- **Third-party requests.** Rendering the map and data does contact third-party
  providers (currently CARTO for basemap tiles and USGS for earthquakes). Those
  providers see standard request metadata (your IP, tile/data URLs). This is
  inherent to fetching public data client-side and is disclosed here.
- **Local-only settings.** User preferences (and, later, any API keys you choose
  to add) are stored in your browser's `localStorage` only. Keys are never
  transmitted to us.
- **Location.** Terra Watch does **not** request your device location in this
  build. If a future feature uses it, it will ask for explicit permission and
  process it on-device, clearly labeled.
- **Clear local data.** A "Clear local data" control is planned for Slice 9; until
  then you can clear site data via your browser settings.

## Attribution & licenses

- Earthquake data: **USGS** (U.S. public domain).
- Basemap: **© OpenStreetMap contributors © CARTO** (shown on the map).
- See `docs/DATA_SOURCES.md` for the full catalog and each source's license.

## Data honesty commitments

1. Data mode (LIVE / DEMO / DEGRADED) is **derived from real fetch results**,
   never hardcoded.
2. Sample/offline/cached data is **labeled as such** everywhere it appears.
3. Every object shows its **source, timestamp, and freshness**; model-generated
   analysis (later slices) will be labeled **inference**, not fact, with citations.
