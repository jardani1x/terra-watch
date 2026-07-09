# Research Matrix

Research conducted before implementation, per the rebuild mandate. Two parallel
research subagents fetched public sources on **2026-07-01**. Every low-confidence
item is flagged. **No proprietary features are claimed; no competitor source is
copied.**

> **Legal note (important):** World Monitor is published under **AGPL-3.0**. Its
> source was **not** read or ported. Everything below is a clean-room *feature
> inventory* derived from public marketing/docs pages and third-party reviews,
> used only to design original Terra Watch equivalents.

---

## Part A — Palantir Gotham: public capability → civilian equivalent

Sources fetched: Palantir public docs (foundry/gotham), a G-Cloud service
listing, Vice's published Gotham police user manual, an IEEE paper. The official
`palantir.com/platforms/gotham/` marketing page returned only a sitemap stub on
fetch; its existence is confirmed but no feature text was extractable.

| Public capability | Evidence | Terra Watch civilian requirement | Excluded (unsafe/private) |
|---|---|---|---|
| Dynamic ontology (Entity / Event / Document objects + relationships) | palantir.com/docs foundry object-link-types; IEEE 10808897 | Entity/relation graph over **public** objects only (countries, markets, quakes, weather, news events) | No private-person entities; no identity records |
| Object Explorer (filter/sort/map/chart/export) | palantir.com/docs object-explorer; Vice manual | Command palette + inspector search/filter over public datasets | No person-lookup / suspect search |
| Graph / link analysis | G-Cloud listing 801146272055049 | Read-only relationship graph of public entities | No social-network/contact-chaining of people; no CDR graphs |
| Gaia geospatial map (radius/route/polygon/temporal geo-search, heatmaps) | palantir.com/docs geospatial add-ontology-data-to-gaia | Interactive map: plot geo-objects, radius/polygon select, public-data heatmaps | No live tracking of persons/vehicles; no targeting overlays |
| Geotemporal / observation histories | palantir.com/docs integrate-geotemporal-series | Timeline playback of public event feeds over space+time | No pattern-of-life / location history of persons |
| Timeline analysis | Vice manual | Event timeline bound to public feeds | No timelines of a person's activities |
| Dossiers / "Virtual Dossiers" | Vice manual | "Situation report" export of selected public entities/charts | **No dossiers on people**; no case files |
| Access controls / audit *(audit wording partly inferred)* | palantir.com/docs gotham/security/overview | Public-data-only ⇒ minimal ACL; adopt provenance/source labels + optional client action log | No classification implying real restricted data |
| Map overlays / layers | palantir.com/docs add-ontology-data-to-gaia | Grouped layer toggles (quakes, weather, markets, news) | No ISR / blue-force / tasking layers |

**Cross-cutting exclusions (Terra Watch will never implement):** military
targeting, weapon tasking, private-person surveillance/pattern-of-life, doxxing,
people-watchlists, CDR/telecom/SIGINT ingestion, biometrics/face-rec, predictive
policing, any real classified data.

---

## Part B — World Monitor: public feature inventory → MVP triage

Sources fetched: worldmonitor.app homepage, `/docs/features`, `/docs/llms.txt`,
and two third-party reviews (darkwebinformer.com, brightcoding.dev). The
vendor's own surfaces disagree on counts (e.g. "56" vs "25" layers, "31" vs "20"
countries, "39-tool MCP") — **all counts treated as unverified.**

| Feature | Public description | Triage | Notes / risk |
|---|---|---|---|
| Many map layers | quakes, fires, flights, vessels, cables, outages… | **MVP (open subset)** | Keyless subset only: USGS, FIRMS, EONET, OpenSky, GDELT, terminator. AIS/outages need keys → Phase 2 |
| Signal convergence engine | 1°×1° cell binning; alert when 3+ event types co-occur in 24h | **MVP** | Algorithm not data — original reimplementation over open feeds |
| Country risk (CII / CRI) | high-freq instability + 0–100 resilience scores | **Phase 2** | Feasible from GDELT/World Bank; label heuristic, show inputs, avoid authoritative framing |
| News aggregation (500+ feeds) | multi-language RSS, source tiering, "propaganda" flags | **MVP** (aggregation); flags = risk | Present bias tags as transparent/sourced, user-toggleable |
| Command palette | jump to regions/layers/panels | **MVP** | Standard UX |
| Route Explorer | shipment routing, chokepoints (PRO-gated) | **Phase 2 (lite)** | Chokepoints from open geodata; trade-flow data heavy |
| Scenario Engine | pre-built disruption what-ifs (PRO-gated) | **Phase 2** | Frame as illustrative simulation, not prediction |
| Source filtering (fetch-time) | per-source toggles, saves bandwidth | **MVP** | Good efficiency pattern |
| Snapshots / baselines | IndexedDB, 7-day retention, deviation deltas | **Phase 2** | Enables "what changed" without a backend |
| Custom keyword monitors | highlight matching articles | **MVP** | Low effort, high value |
| AI briefs / analyst | keyword classifier + LLM override, cited chat | **Phase 2** (keyword tier MVP) | LLM needs BYO key; require citations; no claims about people |
| In-browser ML (Web Workers) | classify/score headlines offline | **Phase 2** | Aligns with keyless goal |
| MCP server / public API / OAuth | hosted API for agents | **Not suitable near-term** | Needs backend; Terra Watch is static/keyless |
| Data freshness indicators | per-layer "last updated" + citations | **MVP** | Core trust feature — already built in Slice 1 |
| Mobile curated layout | reduced layer set, bottom-sheet | **MVP** | Responsive CSS |

**Civil-liberties flags carried into design:** per-country "threat/instability"
scores and AI news classification can stigmatize regions and encode source bias
— if built, label heuristic, show inputs/citations, avoid authoritative or
predictive framing, keep to aggregate already-public data, never individual
tracking.

---

## Consolidated source list

Gotham: palantir.com/docs (foundry object-link-types, geospatial, object-explorer,
gotham/security/overview, gotham/api geotime observations), applytosupply
g-cloud 801146272055049, vice.com Gotham manual, ieeexplore 10808897.

World Monitor: worldmonitor.app (/, /docs/features, /docs/llms.txt,
/docs/api-reference via snippet), darkwebinformer.com review, blog.brightcoding.dev review.
