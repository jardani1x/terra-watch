# Phase 2A Implementation Plan — derived + static layers

> Executed inline this session (executing-plans); slices committed + tested
> individually. Triage: docs/superpowers/specs/2026-07-09-phase2-layer-triage.md

**Goal:** Ship Tranche A: collapsible layer groups + ~13 derived/static layers,
each honest (source-labeled, no invented data).

**Slices**

1. **Layer-manager collapsible groups.** Groups render as collapsible
   sections (persisted `groupCollapsed: Record<string, boolean>`); existing
   groups renamed with emoji (🌋 Natural events, ⚠ Advisories, 🏗 Infrastructure,
   🧠 Derived). Playwright: group header toggles rows.
2. **Derived layers.** (a) 🎯 INTEL HOTSPOTS — `computeSignals` cells as a
   circle layer (store-side derived GeoEvents, provider `derived-signals`,
   reference=true excluded from signals recursion). (b) ⚓ CHOKEPOINTS +
   ⚓ TRADE ROUTES — points + great-circle lines from `chokepoints.ts`.
   (c) 🌎 CII INSTABILITY — country choropleth from risk scores (own derived
   index, labeled DERIVED; distinct from P1 alert levels which stay).
3. **Curated static registries** (small, hand-curated, source-labeled with
   retrieval date; no invented numeric claims): 💰 ECONOMIC CENTERS (major
   exchanges, ported from legacy v1 ontology), 🖥 AI DATA CENTERS (major
   publicly-reported hyperscale AI sites), ☢ NUCLEAR SITES extension
   (enrichment/fuel-cycle sites, NTI/IAEA public reporting), 🚫 SANCTIONS
   (country-level comprehensive-programs choropleth, OFAC/EU/UN public lists).
   Ship as `public/data/*.json` with `source`+`retrieved` headers, loaded via
   reference-provider pattern (like nuclear_plants.json).
4. **Fetched static datasets** — attempt real downloads now: 🔌 UNDERSEA
   CABLES (TeleGeography GitHub GeoJSON). If a download fails or license
   unclear → defer honestly in GAP_MATRIX (never fabricate). Pipelines /
   critical minerals / resilience deferred to a follow-up unless trivially
   fetchable (GEM/USGS/ND-GAIN need manual extracts).
5. **🏛 MILITARY BASES** — keyless OSM Overpass `military=*` in-view query,
   v1-legacy pattern (bbox QL, mock fallback, in-view refresh); default off.

**Conventions:** each new provider follows `FetchResult` mock-fallback; every
layer gets LayerDef color + group; counts/visibility free via layers.ts; tests
appended to smoke.spec.ts per slice; typecheck + build + targeted Playwright
per slice, full suite at end.
