# Forleads

**The living-map agentic CRM for real-estate agents.** Every address is a lead; a bounded swarm of grounded AI scouts does the homework, the outreach, and the follow-up — **grounded, never guessed.**

> There is no free, global, accurate property-price database. So Forleads never pretends there is. Every claim it shows is **grounded with a citation and a confidence grade (A–D)**, and everything it can't prove is labeled an estimate with its reasoning. **Trust is the product.**

This repo is a **production-grade vertical slice**: a real architecture (typed contracts, bounded multi-agent swarm, fail-closed compliance, durable loop engine, idempotent connectors, full auditability) that runs **end-to-end locally with zero credentials** in mock mode, and flips provider-by-provider to live with env vars.

---

## The magic loop

```
TAP ADDRESS → cinematic fly-to (the scout loading window)
   ↓  DISPATCHER plans bounded, budgeted SCOUTS (property/imagery/people/market/risk)
   ↓  REDUCER merges + de-dups + grades → EVIDENCE CARDS (every card cites its source)
   ↓  You add a NOTE → classifier picks the SITUATION → next-best-action
   ↓  COMPOSER drafts compliant outreach → COMPLIANCE LINTER (fail-closed) → REVIEW TRAY
   ↓  You APPROVE → idempotent connector write (Gmail draft / calendar / CRM) → logged to memory
   ↓  AGENT TRACE explains every step; LOOP ENGINE automates it; WEEKLY REPORT compounds it
```

---

## Quick start (zero credentials)

```bash
npm install
npm run dev
# open http://localhost:3000
```

Everything works in **mock mode** — no API keys required. Try the [end-to-end test script](#what-to-test--what-feedback-i-want) below.

Other scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm test            # deterministic Vitest suite
npm run test:coverage  # whole-app and security-core coverage
npm run smoke:map   # production-build smokes: map, signed-out flow, axe (after npm run build)
npm run build       # next production build
npm run agent:doctor
npm run agent:check -- --risk=high
npm run agent:scorecard
```

---

## Architecture (one core, modular)

| Module | Responsibility |
|---|---|
| `src/lib/core` | Domain types + the **EvidenceCard contract**, ids, idempotency keys, geo/H3 |
| `src/lib/design` | "Cartographic Luxe" design tokens — the single source of truth for color/type/motion |
| `src/lib/evidence` | EvidenceCard **validation** + grading + grounding (no naked numbers, enforced in code) |
| `src/lib/agents` | Dispatcher · Scouts · Reducer · Notes classifier · Composer · **Compliance linter** · Agent Trace |
| `src/lib/providers` | PropertyData / Imagery / Geocode providers (mock + real OSM/Photon/Mapillary) |
| `src/lib/connectors` | Connector interface + Mock/Gmail/Calendar/FollowUpBoss/GoHighLevel/Twilio/Zapier + idempotency ledger |
| `src/lib/loops` | **Action Loop Engine** + 4 default loops |
| `src/lib/db` | Repository (in-memory mock + Supabase-ready) + seed |
| `src/lib/pipeline.ts` | Orchestration: swarm → draft → human-gated approve |
| `src/lib/reports.ts` | Weekly Intelligence Report |
| `src/app/api/*` | Server routes (lead, notes, draft, approve, inbox, loops, connectors, report, trace, geocode) |
| `src/components/*` | Map Workspace, Lead Rail, Evidence stream, Note Composer, Review Tray, Action Inbox, Loop Studio, Connector Hub, Weekly Report, Agent Trace |
| `supabase/migrations/*` | Postgres schema (PostGIS + pgvector + **RLS** + idempotency keys + row-level compliance gate) |

### Non-negotiables enforced in code
- **EvidenceCard contract:** if `confidence !== 'D'` then `sources ≥ 1` and `value != null`; `'D'` means `value: null` + honest gap. (`src/lib/evidence/validate.ts`, DB `evidence_contract` check)
- **Fail-closed compliance:** every outbound artifact is screened; a blocking flag makes it un-approvable. (`src/lib/agents/compliance.ts`, DB `compliance_gate` check)
- **Human gate:** nothing sends without explicit approve. Email = draft-first.
- **Revision-safe review:** edits persist, rerun compliance, and invalidate stale approvals.
- **Idempotent connector writes:** retries never duplicate side effects. (`src/lib/connectors/idempotency.ts`, DB `connector_write.idempotency_key UNIQUE`)
- **Auditability:** every artifact has an Agent Trace; every loop run is logged.
- **No protected attributes stored; no secrets client-side.**

---

## Live in production vs demo-only

What https://forleads.vercel.app actually does, from the 2026-11-07 audit and
this branch's `/api/health` capability report. "Demo-only" means it runs in
local mock mode (`npm run dev`) and is **not** what a production user gets.

| Feature | Production (live site) | Demo / mock only |
|---|---|---|
| Map, fly-to, aerial toggle | **Live** once PR #59 is on main (OpenFreeMap + Esri, keyless). Until then `main` serves CARTO "API KEY REQUIRED" tiles | same |
| Address search | **Live.** Public Photon typeahead, Nominatim for a single Enter lookup | mock gazetteer ("12 Oak Street" is a mock address; live it matches places in New York and Sydney) |
| Scout pass (evidence cards) | **Live, after Google sign-in only.** Signed out, research shows a sign-in panel | runs signed out (demo writes allowed in `next dev`) |
| Property facts | **Live.** OSM building tags (A only when the building outline contains the point, else C) plus the built-in open-data catalog (about 23 official datasets: US, CA, UK, FR) | deterministic OSM-style facts |
| Market comps / assessed value | **Live where the catalog covers the point** (official sales and assessment registers). Elsewhere an honest D gap | D card "no comps in free tier" |
| Street imagery | **Live** (Mapillary) if `MAPILLARY_TOKEN` is set; `/api/health` → `capabilities.imagery` says which | mock vision captions |
| Flood / violations risk | **Live.** FEMA NFHL, EA flood, city violation feeds | mock risk |
| People / owner data | Never: always a D gap ("not public data") | same |
| Drafts, classifier (Claude) | **Live only if** `capabilities.agent.status` is `live`; `configured_no_key` means templates | deterministic templates |
| Gmail drafts, Calendar holds | **Live via the user's Google OAuth.** Not yet verified end-to-end in production | labeled mock writes |
| Follow Up Boss | **Blocked** until Forleads is registered with FUB | labeled mock |
| Microsoft 365, GoHighLevel, Twilio | **Blocked** (safety gates not shipped) | labeled mock |
| Zapier | Not connected | labeled mock |
| Autopilot loops, Recap | **Live** for signed-in data; nightly cron needs `CRON_SECRET` | works on demo data |
| Mock connector writes | **Refused** in production (`productionPolicy.mockConnectorWritesAllowed: false`) | allowed |

"Live" means production runs the real provider code path. The audit verified
only geocoding and the persistence read path end to end; the signed-in loop
(scout pass → note → draft → approve → Gmail draft) has not been verified in
production yet.

`/api/health` reports `modes` (the effective mode per provider), `capabilities`
(per-path status and key presence, never values) and `degraded` (what was asked
for but can't run). A post-deploy smoke checks it after every production deploy
(`.github/workflows/post-deploy-smoke.yml`).

---

## Capability posture: configuration is not proof

| Capability | Mock (default, $0) | Live (add env) |
|---|---|---|
| Map + fly-to + beacons | ✅ OpenFreeMap dark vector style + Esri aerial (keyless) | same; provider is one constant in `src/lib/map/basemap.ts` |
| Geocode autocomplete | ✅ global gazetteer | Production default `photon`: public Photon suggests as you type, public Nominatim only resolves an Enter with no suggestion (≤1 req/s), cached 24 h and rate limited. Self-host both with `FORLEADS_GEOCODER=photon-nominatim` |
| Property facts | ✅ deterministic OSM-style | `FORLEADS_PROPERTY_PROVIDER=osm` (Overpass) |
| Imagery | ✅ mock vision captions | `MAPILLARY_TOKEN` |
| Scouts/Reducer/Composer/Compliance | ✅ deterministic | `FORLEADS_AGENT_MODE=live` + `ANTHROPIC_API_KEY` |
| Gmail draft | ✅ labeled mock | `GOOGLE_*` OAuth → real `drafts.create` (MIME/base64url ready) |
| Google Calendar | ✅ labeled mock | verified Google OAuth → real events |
| Follow Up Boss | ✅ labeled mock | registered FUB system + tenant key + identity test + exact-match sync; notes/tasks only |
| GoHighLevel / Twilio | ✅ labeled mock | blocked from onboarding until contact/consent safety gates ship |
| Zapier outbound | ✅ labeled mock | single-environment `ZAPIER_WEBHOOK_URL`; tenant routing still required for multi-tenant use |
| Persistence | ✅ in-memory | `FORLEADS_PERSIST=supabase` + `SUPABASE_*` |

See `.env.example` and `docs/operator-setup-guide.md`. The **Connect** screen
separates blocked, configured, identity-verified, and capability-ready states;
key presence alone never proves a working integration.

---

## Hosting setup (Vercel + Supabase)

See **[docs/SETUP.md](docs/SETUP.md)** for the full step-by-step (git/GitHub, Vercel deploy, Supabase schema + RLS, Google OAuth for real Gmail drafts, and the recommended test plan).

## Product Engineering OS

`AGENTS.md` is the model-neutral operating contract for Codex and Claude.
`.agent/` holds plans, decisions, learned failures, source provenance,
evaluations, stress baselines, and historical handoffs. The commands under
`agent:*` produce narrow context packs and select proof gates by risk instead of
depending on a model to remember a giant prompt.

---

## What to test & what feedback I want

**This walkthrough is mock mode** (`npm run dev` → http://localhost:3000). The
addresses and the D-grade market card below come from the mock providers.

**Live example (production):** sign in with Google at
https://forleads.vercel.app, then search "22125 Clarksburg Rd, Clarksburg, MD".
Montgomery County, MD is in the open-data catalog, so official records can
ground the cards. Signed out, you get the sign-in panel instead of a scout pass.

1. **The magic loop.** ⌘K → pick "12 Oak Street" (mock address) → watch it fly in while cards stream. Add note "Knocked, no answer" → draft writes itself → open "Why?" → Approve.
2. **Grounding honesty.** Note the **Market → grade D** card ("no comps in free tier", mock mode). That's the point — it never fakes a number.
3. **Compliance fail-closed.** The quick-note "Knocked, no answer" includes "kids' bikes" — the composer strips it (see the Trace's *Excluded*). Try drafting copy with "great for families" and watch it get **blocked**.
4. **Idempotency.** Approve the same draft from the Review Tray and again from Approvals — second write is `deduped`.
5. **Loops + report.** Autopilot → pick the lead → "Run now" on No-contact → check Approvals → Recap metrics update.

**Feedback that helps most:** (a) does the fly-to → cards moment *feel* magical or slow? (b) are the evidence grades believable/legible? (c) is the Review Tray copy good enough to send? (d) any place a number appears without a grade (that's a bug)? (e) which connector you'd want live first.

---

*Built per the `docs/` constitution. Verify free-tier limits at build time — they change.*
