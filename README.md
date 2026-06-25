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
npm test            # vitest (87 tests)
npm run build       # next production build
npm run agent:scorecard # production policy + typecheck + lint + tests + atomic handoff
```

Agent/model handoffs are machine-backed in `.agent/`: edit
`session-state.json` when the objective changes, then run
`npm run agent:scorecard`. The generated `CHECKPOINT.json`, `SCORECARD.json`,
and `SESSION_HANDOFF.md` preserve exact progress across crashes and
Claude/Codex switches.

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
- **Idempotent connector writes:** retries never duplicate side effects. (`src/lib/connectors/idempotency.ts`, DB `connector_write.idempotency_key UNIQUE`)
- **Auditability:** every artifact has an Agent Trace; every loop run is logged.
- **No protected attributes stored; no secrets client-side.**

---

## Mock ⇆ live: what works with which keys

| Capability | Mock (default, $0) | Live (add env) |
|---|---|---|
| Map + fly-to + beacons | ✅ CARTO dark raster + Esri aerial | same (Protomaps PMTiles in prod) |
| Geocode autocomplete | ✅ global gazetteer | `FORLEADS_GEOCODER=photon-nominatim` |
| Property facts | ✅ deterministic OSM-style | `FORLEADS_PROPERTY_PROVIDER=osm` (Overpass) |
| Imagery | ✅ mock vision captions | `MAPILLARY_TOKEN` |
| Scouts/Reducer/Composer/Compliance | ✅ deterministic | `FORLEADS_AGENT_MODE=live` + `ANTHROPIC_API_KEY` |
| Gmail draft | ✅ labeled mock | `GOOGLE_*` OAuth → real `drafts.create` (MIME/base64url ready) |
| Calendar / FUB / GHL / Twilio / Zapier | ✅ labeled mock | matching keys in `.env.local` |
| Persistence | ✅ in-memory | `FORLEADS_PERSIST=supabase` + `SUPABASE_*` |

See `.env.example` for every key. The **Connector Hub** screen shows mock/live status live.

---

## Hosting setup (Vercel + Supabase)

See **[docs/SETUP.md](docs/SETUP.md)** for the full step-by-step (git/GitHub, Vercel deploy, Supabase schema + RLS, Google OAuth for real Gmail drafts, and the recommended test plan).

---

## What to test & what feedback I want

Once running (`npm run dev` → http://localhost:3000):

1. **The magic loop.** ⌘K → pick "12 Oak Street" → watch it fly in while cards stream. Add note "Knocked, no answer" → draft writes itself → open "Why?" → Approve.
2. **Grounding honesty.** Note the **Market → grade D** card ("no comps in free tier"). That's the point — it never fakes a number.
3. **Compliance fail-closed.** The quick-note "Knocked, no answer" includes "kids' bikes" — the composer strips it (see the Trace's *Excluded*). Try drafting copy with "great for families" and watch it get **blocked**.
4. **Idempotency.** Approve the same draft from the Review Tray and again from the Action Inbox — second write is `deduped`.
5. **Loops + report.** Loop Studio → "Run now" on No-contact → check Action Inbox → Weekly Report metrics update.

**Feedback that helps most:** (a) does the fly-to → cards moment *feel* magical or slow? (b) are the evidence grades believable/legible? (c) is the Review Tray copy good enough to send? (d) any place a number appears without a grade (that's a bug)? (e) which connector you'd want live first.

---

*Built per the `docs/` constitution. Verify free-tier limits at build time — they change.*
