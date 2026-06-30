# WS-A provider choice - ATTOM

Status: accepted, 2026-06-30.

## Decision

Use ATTOM as the first licensed US property and owner data provider behind the
existing `PropertyDataProvider` seam.

## Rationale

ATTOM is the best current fit for WS-A because it can cover owner, structure,
sale, and property detail facts in one feed for the US market. The Phase 0
packet estimated roughly `$0.02-$0.05` per lookup, so the v1 integration must
ship with a tenant-level spend cap and setup-required behavior when credentials
are absent.

## Product posture

- Surface owner full name as a cited EvidenceCard, not as model-derived text.
- Never let ATTOM become the source of demographic, protected-class, or
fair-housing-adjacent inference.
- Missing credentials, quota exhaustion, unsupported market, or provider failure
must return a grade-D setup/gap card rather than fabricated facts.
- Keep OSM/open-data fallback active and explicit.

## Reversibility

The choice is reversible by env/config because the provider lives behind the
property-provider seam. A future provider can replace ATTOM without changing
EvidenceCard semantics or downstream composer behavior.

## Dependencies

See `.agent/decisions/phase-0-resolutions.md` and `.agent/plans/ws-a.md`.
