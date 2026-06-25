# Forleads — Engineering Constitution

You are building Forleads: a living-map agentic CRM for real-estate agents.
Before changing code, read `.agent/CHECKPOINT.json` (or run
`npm run agent:checkpoint` if it does not exist). Before claiming completion,
run `npm run agent:scorecard`; a missing, running, interrupted, or failed
scorecard is not success.
The docs/ folder is the SOURCE OF TRUTH. Read docs/Forleads_Vision_v1.md,
_Architecture_, _AgentLoops_, _DesignSystem_, _MapGIS_, _Screens_, and
_ProductionMarketPlan_ before coding.

## Non-negotiable principles
1. The MAP is the home screen. Spatial-first, list-second.
2. NO NAKED NUMBERS. Every value rendered must carry {sources[], confidence A–D}.
   A scout MUST NOT return a value without a source; if it can't ground a claim it
   returns confidence 'D', value null, and an honest gap.
3. The NOTE is a trigger: note → situation → next-best-action → DRAFT in a Review Tray.
4. HUMAN-IN-THE-LOOP gate: nothing sends without an explicit human Approve.
5. BOUNDED SWARM: Dispatcher → parallel budgeted Scouts → Reducer. Max ONE break-out,
   never recursive. Hard budgets (time/tokens/calls) + per-scout source allowlists.
6. DEGRADE GRACEFULLY, GLOBALLY. OSM is the free floor; richer data is a pluggable
   PropertyDataProvider per market. Never fake richness in thin regions.
7. COMPLIANCE built-in: a fail-closed fair-housing linter screens every generated message.
8. ONE CORE, MODULAR. Shared modules in src/lib/*; UI in src/components + src/app.
9. Design tokens live ONLY in src/lib/design (doc 05). Never hardcode colors.
10. Cache-first by H3 to respect free-tier limits and keep cost ≈ $0.
11. Every agent action is inspectable via an Agent Trace ("Why this happened").
12. Every connector write is idempotent (idempotency key). Every loop run is logged.
13. Do NOT store protected demographic attributes. No secrets in client code.

## Provider posture (mock ⇆ real)
Every external dependency has a typed interface and a working MOCK adapter so the
full product loop runs locally with zero credentials. Real adapters activate via
env vars (see .env.example). Never fake the architecture — only the data source.

## The motion rule
The cinematic fly-to IS the scout loading window. The aqua "thinking" beacon animates
ONLY while real scouts run. Never fake discovery. Respect prefers-reduced-motion.

## Definition of done for any feature
- Types enforce the EvidenceCard contract (doc 04 §2).
- Has an honest empty/low-data state.
- Generated outreach passes the compliance linter before it can be approved.
- No secret keys client-side; external calls go through server routes.
- Every produced artifact has an Agent Trace; every loop run is logged.

## Module map
- src/lib/core      — types, contracts, ids, result types
- src/lib/design    — design tokens (single source of truth)
- src/lib/evidence  — EvidenceCard validation + grading + grounding
- src/lib/agents    — dispatcher, scouts, reducer, notes, composer, compliance, trace
- src/lib/connectors— Connector interface + Mock/Gmail/Calendar/FUB/GHL/Twilio/Zapier
- src/lib/loops     — Action Loop Engine + loop definitions
- src/lib/providers — PropertyData / Imagery / Geocode providers (mock + real)
- src/lib/db        — repository (in-memory mock + Supabase) + domain event log
- src/app/api       — server routes (dispatch, scouts, reduce, notes, draft, send, loops…)
