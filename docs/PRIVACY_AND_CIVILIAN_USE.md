# Privacy & Civilian Use

## Public-OSINT posture

Terra Watch is a **civilian open-source-intelligence (OSINT) situational-awareness
and research tool**. It aggregates **public, licensed, or user-supplied** data.
Displaying public open data *about* conflicts and military topics — news, public
event datasets, reference registries — is in scope (amended 2026-07-09).

It is **not**:
- an emergency-authority or life-safety data source,
- a targeting, weapon-tasking, or military C2 system,
- a surveillance tool for tracking individuals,
- a source of verdicts about people, groups, or "threats".

Always verify with official authorities before acting on anything shown here.

### Explicitly excluded features (by design, permanently)
Weapon targeting or tasking · fire control · private-person surveillance or
pattern-of-life · doxxing · people-watchlists · CDR/telecom/SIGINT ingestion ·
biometrics/facial recognition · predictive policing · any real classified data.
All data shown remains public and advisory (Public OSINT, Demo data, Source
confidence, Advisory labels).

## Privacy model

- **No Terra Watch backend.** The app is a static site. All data is fetched
  **directly from public providers by your browser**. Nothing you view, toggle,
  select, or search is sent to a Terra Watch server (there isn't one).
- **Third-party requests.** Rendering the map and data does contact third-party
  providers (currently CARTO for basemap tiles and USGS for earthquakes). Those
  providers see standard request metadata (your IP, tile/data URLs). This is
  inherent to fetching public data client-side and is disclosed here.
- **Local-only settings.** User preferences and any API key you choose to add
  for the optional AI analyst are stored in your browser's `localStorage`
  only. Keys are never transmitted to us — there is no Terra Watch server to
  send them to.
- **AI analyst keys (optional, BYO).** If you add an Anthropic or
  OpenAI-compatible API key, it is sent **directly from your browser to that
  provider only** (Anthropic via its documented direct-browser-access path;
  OpenAI-compatible via whatever base URL you supply). Every reply is
  labeled **inference**, cited to the public events it drew on, and the
  local rule-based brief remains available with zero key and zero network
  calls. Requests matching the excluded categories below are refused
  locally, before any network call is made.
- **Location.** Terra Watch does **not** request your device location in this
  build. If a future feature uses it, it will ask for explicit permission and
  process it on-device, clearly labeled.
- **Clear local data.** The **Privacy** panel's "Clear local data" control
  wipes everything Terra Watch has stored in this browser — settings,
  monitors, the link graph, the dossier, any saved analyst API key, and
  snapshots — and reloads. You can also clear site data via your browser
  settings at any time.

## Attribution & licenses

- Earthquake data: **USGS** (U.S. public domain).
- Basemap: **© OpenStreetMap contributors © CARTO** (shown on the map).
- See `docs/DATA_SOURCES.md` for the full catalog and each source's license.

## Data honesty commitments

1. Data mode (LIVE / DEMO / DEGRADED) is **derived from real fetch results**,
   never hardcoded.
2. Sample/offline/cached data is **labeled as such** everywhere it appears.
3. Every object shows its **source, timestamp, and freshness**; model-generated
   analysis (the optional AI analyst) is labeled **inference**, not fact, and
   cited to the public events it drew on.
