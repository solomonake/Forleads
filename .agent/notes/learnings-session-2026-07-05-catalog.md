# Session learnings — 2026-07-05/06 · built-in region catalog + UI polish

## What worked
- **Verify-then-catalog loop:** curl-probe every candidate endpoint BEFORE
  writing code; 5 of 16 candidates were dead or unusable (LA Socrata retired →
  ArcGIS hub redirect, api.cquest.org DVF 502, Cape Town FeatureServer 500,
  Cook County sales PIN-keyed with no address column, EA legacy
  `environment.data.gov.uk/arcgis` endpoint dead — replaced by
  `KB6uNVj5ZcJr7jUP/ArcGIS/rest/services/Flood_Map_for_Planning/FeatureServer`).
- **Live opt-in harness** (`LIVE_CATALOG=1 npx vitest run
  src/lib/providers/catalog.live.test.ts`) — 10/10 against real endpoints.
  Rerun whenever the catalog changes; it's the source-rot alarm.
- **Self-grounding live tests**: for datasets whose content drifts (HMLR, DVF),
  fetch a live record first, then assert the pipeline finds THAT record.

## Data-source gotchas (production-relevant)
- Socrata `$q` full-text works for per-address lookup; always `$limit=25` and
  post-filter with addressesMatch. Without an app token it's rate-limited —
  failure degrades to a grade-D gap, never a guess.
- Opendatasoft (Vancouver): busy streets exceed one page (ALBERTA ST = 1,642
  rows) — civic number MUST be in the server-side `where`, not just local
  matching.
- HMLR PPD: `paon` can be a house NAME with the unit in `saon` ("ROSEMOUNT
  COTTAGE" / saon "3") — match against both compositions or you reject real
  records.
- France DVF: `geo.api.gouv.fr/communes?lat&lon&type=arrondissement-municipal`
  first (Paris/Lyon/Marseille publish per arrondissement), fall back to plain
  communes; per-commune CSV is small enough to fetch at runtime, cache 6h.
- FEMA NFHL layer 28 point query + EA Flood Zone layers 1 (FZ3) / 2 (FZ2) are
  both live, free, national.

## Environment gotchas
- Recorded in user memory `machine-constraints`: worktrees have no
  node_modules (parent resolution), `outputFileTracingRoot` required, never
  run `next dev` + `next build` concurrently (shared `.next/` → webpack-runtime
  prerender TypeError), Vercel preview + share URL is the reliable QA loop.

## Deliberately excluded sources (do NOT re-add without re-verification)
- Cape Town Open_Data_Service (down 2x on 2026-07-05)
- Cook County parcel sales (needs PIN join — two-hop, revisit later)
- api.cquest.org DVF mirror (dead)
- data.lacounty.gov Socrata (retired platform)
