# Plan: WS-F · Buyer Watchers (standing agents, UC-4)

> Model-agnostic. Everything a model needs is here. The Watcher seam (type +
> table + repo methods + buyer-watcher loop definition) already exists; this
> packet wires the missing API, evaluator, scheduler hook, and Review-Tray
> path so a saved buyer criteria becomes a recurring, grounded "found one"
> draft.

**Goal:** A user can save a buyer criteria record (beds, features, maxPrice,
district, area_label) and have it evaluated on a recurring cadence; any
LeadSurface in that area that newly matches the criteria produces a draft
"found one" email in the Review Tray, with a planner trace and idempotency on
`(watcher_id, lead_surface_id)`.

**Why / value:** UC-4 turns a one-shot conversation ("buyer wants 3-bed,
garden, under €X, this district") into a never-dropped standing agent — the
workflow moat from Vision §6.3. Today the buyer-watcher loop definition ships
but has no trigger source: nothing ever emits `watcher.hit`, so the loop never
fires. Friday client (real-estate agent, 2026-06-25 → ongoing) explicitly
asked for buyer-side automation; this is the first revenue surface that
demonstrates "leads work themselves" for the buy side.

**User / job:** A real-estate agent representing a buyer wants the system to
re-check the area+criteria on a fixed cadence (default daily) and surface
matches as ready-to-send messages to the buyer — without polling portals
themselves.

**Pain evidence:**
- `docs/Forleads_UserCases_v1.md` UC-4 "Today: Agent manually re-checks
  portals." → no in-product surface today.
- `src/lib/loops/definitions.ts:53-64` defines `loop-buyer-watcher` with
  trigger `watcher.hit`, but `grep -rn 'watcher.hit'` shows zero emitters
  outside the type union (`src/lib/core/types.ts:359`).
- `repository.listWatchers` / `upsertWatcher` exist
  (`src/lib/db/repository.ts:76-77`, `src/lib/db/supabase-repo.ts:602-611`)
  but no `/api/watchers` route exists (`ls src/app/api/` confirms).

**Current → desired behavior:**
- Before: no watcher CRUD, no evaluator, the buyer-watcher loop is dead code.
- After:
  - `POST /api/watchers` creates a Watcher row (BuyerCriteria + area_label).
  - `GET /api/watchers` lists this tenant's watchers with last-run + hits.
  - `PATCH /api/watchers/[id]` toggles `active` and edits criteria.
  - `DELETE /api/watchers/[id]` deactivates (soft).
  - Scheduler tick (Vercel cron, reuses `runScheduledLoops` path) evaluates
    every active watcher against `listLeads(agent_id)`; for each lead that
    (a) lies inside `area_label` (string match v1) and (b) satisfies
    `BuyerCriteria` predicate and (c) was not already matched for this
    watcher (idempotency key: `watcher-hit:{watcherId}:{leadId}`), it claims a
    `watcher.hit` domain event and invokes `runLoop(loop-buyer-watcher, …)`.
  - The produced artifact is an email draft sitting in the Action Inbox with
    a planner trace citing which criteria matched (no naked numbers — every
    feature claim cites the EvidenceCard it came from; missing → grade D).

**Non-goals (defer):**
- Real-time listing-feed ingestion (portal MLS adapters live in WS-A/WS-C).
  V1 evaluates against `LeadSurface` rows already in the workspace.
- Geometric area predicate (`area_geom` polygon contains-point). V1 matches
  on `area_label` string equality / `district` field; PostGIS predicate is a
  follow-up once a polygon-picker UI lands.
- A standalone Watcher UI screen. V1 ships API + a row in Loop Studio's
  observability panel. UI screen is a downstream packet.
- Auto-send the "found one" message — Forleads invariant: human approval
  remains.

**Risk tier:** **medium**.
- Touches persistence (new write paths to `watcher`, `domain_event`,
  `loop_run`, `artifact`) and the scheduler hot path — both are tenant-
  isolation and idempotency surfaces (`→ playbook.md` gotchas: seed-id +
  IDOR + claimEvent).
- No new external network egress; no auto-send (artifacts stay drafts).
- Not `high` because all writes are inside our own tenant boundary, no
  credentials, no migrations beyond a possible idempotency-key index.

**Context links:**
- `docs/Forleads_Vision_v1.md` §6.3 (workflow moat), §10 month-3 watchers.
- `docs/Forleads_UserCases_v1.md` UC-4.
- `.agent/playbook.md` — seam pattern, no-naked-numbers, IDOR rule, claimEvent
  idempotency, `workspaceSeedId` for any new tenant-keyed seed rows.
- `src/lib/loops/definitions.ts:53-64` — existing buyer-watcher loop def.
- `src/lib/loops/engine.ts:68-164` — `runLoop` signature; reuse as-is.
- `src/lib/loops/scheduler.ts:89-185` — `runScheduledLoops` is the cron entry;
  we add a parallel `runWatcherSweep` and call it from the cron route.
- `src/lib/core/types.ts:475-491` — `Watcher` + `BuyerCriteria`.
- `src/lib/db/repository.ts:76-77` — `listWatchers` / `upsertWatcher`.
- `src/lib/db/supabase-repo.ts:602-611` — Supabase impl already wired.
- `supabase/migrations/0001_init.sql:188-200` — `watcher` table exists.
- `src/app/api/cron/loops/route.ts` — pattern for cron handler (auth +
  `withRoute`).
- `src/app/api/loops/route.ts` — pattern for tenant-scoped API
  (`readAgentIdEnsured` / `ensureCurrentAgent`).

**Seams & exact files:**

*New files:*
- `src/lib/watchers/criteria.ts` — pure predicate
  `matchesCriteria(lead: LeadSurface, evidence: EvidenceCard[], c: BuyerCriteria): { pass: boolean; reasons: string[] }`.
  Reads beds/features/price/district from EvidenceCards only (no naked
  numbers); missing claim → grade D → does NOT count as a match.
- `src/lib/watchers/sweep.ts` — `runWatcherSweep(repo, { now, maxHits })`
  mirroring `runScheduledLoops` shape (`ScheduledLoopSummary` analogue).
  Iterates `listAgents` → `listWatchers(agent)` → `listLeads(agent)`,
  evaluates `matchesCriteria`, claims a `watcher.hit` `DomainEvent` via
  `repo.claimEvent` with key `watcher-hit:{watcherId}:{leadId}:{utcDayKey}`,
  invokes `runLoop(buyerWatcherDef, ctx)`.
- `src/lib/watchers/sweep.test.ts` — vitest covering: match, no-match,
  idempotent re-run (claimEvent returns false), inactive watcher skipped,
  per-tenant isolation, cap honoured.
- `src/app/api/watchers/route.ts` — `GET` (list) + `POST` (create) via
  `withRoute("watchers.list" / "watchers.create")`.
  `readAgentIdEnsured()` for GET; `ensureCurrentAgent()` for POST.
- `src/app/api/watchers/[id]/route.ts` — `PATCH` (update criteria / toggle
  `active`) + `DELETE` (soft via `active=false`). Tenant-checked: load row
  and 404 if `agent_id !== caller`.
- `src/app/api/watchers/route.test.ts` — auth-guard test (anon → 401 on
  POST), IDOR test (other-tenant id → 404), happy-path create+list.

*Edited files:*
- `src/app/api/cron/loops/route.ts` — after `runScheduledLoops`, call
  `runWatcherSweep(await getRepo())` and merge summaries into the log line.
  (Same Bearer-secret guard already in place.)
- `src/lib/validation.ts` — add `BuyerCriteria` validator (positive int
  beds, string[] features ≤ 8 items ≤ 60 chars each, finite positive
  maxPrice, district ≤ 80 chars). Reuse `str`/`optStr` primitives.
- `src/lib/observability.ts` — add `"watchers.sweep"` route key only if a
  hardcoded allowlist exists; otherwise no change (verify before edit).

*Verified NOT touched (the seam is already complete):*
- `src/lib/db/repository.ts` — listWatchers/upsertWatcher already present.
- `src/lib/db/supabase-repo.ts` — Supabase Watcher row maps already present
  (`watcherToRow` / `watcherFromRow`).
- `supabase/migrations/0001_init.sql` — `watcher` table already exists.

*Conditional new file (if missing after probe):*
- `supabase/migrations/0011_watcher_indexes.sql` — `create index if not exists`
  on `watcher(agent_id, active)` and on `domain_event(agent_id, idempotency_key)`
  IF the latter is missing (it powers our claim path). Verify with
  `\d domain_event` before adding.

**Steps:**
1. Probe: confirm `domain_event.idempotency_key` index exists (Supabase MCP
   `execute_sql "select indexname from pg_indexes where tablename='domain_event'"`).
   If missing, add migration 0011; otherwise skip.
2. Write `src/lib/watchers/criteria.ts` + unit tests (pure, no I/O — cheapest
   thing to land first).
3. Write `src/lib/watchers/sweep.ts` mirroring `scheduler.ts` shape, reusing
   `runLoop` and `claimEvent`. Inject `executeLoop` for testability.
4. Wire `runWatcherSweep` into `src/app/api/cron/loops/route.ts` after
   `runScheduledLoops`; merge summaries in the log payload.
5. Add `src/app/api/watchers/route.ts` (GET/POST) + `[id]/route.ts`
   (PATCH/DELETE), reusing `readAgentIdEnsured` / `ensureCurrentAgent`
   patterns from `src/app/api/loops/route.ts`.
6. Add `BuyerCriteria` validator to `src/lib/validation.ts` and use it from
   both POST and PATCH.
7. Tests: route auth-guard (anon → 401), IDOR (other-tenant → 404), sweep
   idempotency (second run claims 0), criteria matching grades.
8. Local smoke via `npm run dev` + `bash scripts/smoke.sh` extended with a
   watcher POST → cron tick → inbox GET to see the draft.
9. Run gates: `npm run agent:check -- --risk=medium`.

**Acceptance scenarios:**
- **Happy:** `POST /api/watchers` with `{name, criteria:{beds:3,maxPrice:450000,district:"Lapa",features:["garden"]}, area_label:"Lapa"}` → 201, row visible via `GET`. Cron tick creates exactly one draft email artifact for the matching lead; planner trace lists matched criteria with their EvidenceCard sources. Loop Studio `observability` payload (`/api/loops`) shows the new run.
- **Idempotent:** Cron tick re-run within the same UTC day with no new matching leads produces zero new artifacts; `claimEvent` returns `false`. Summary reports `deduped > 0, claimed = 0`.
- **Empty / no match:** Watcher with criteria nothing matches → sweep completes, summary has `due:0, claimed:0`, no draft created. UI tray unchanged.
- **Failure (compliance):** A matched lead whose draft trips the compliance linter → loop run status `blocked_compliance`; artifact appears in inbox as blocked (existing UX), not silently dropped.
- **Tenant isolation / IDOR:** User A `PATCH`s a watcher owned by user B → 404 (not 403, to avoid existence leak). Confirmed in test.
- **Auth fail-closed:** Anon `POST /api/watchers` → 401; anon `GET` returns demo workspace read-only per existing `readAgentId()` convention.
- **Recovery:** A throw inside `runLoop` (simulated) → the sweep records an `error` run via `errorRun()` analogue and continues to next lead; sweep summary `errors > 0` but `ok:false` only if any errored.

**Break plan (adversarial probes):**
- Watcher with `maxPrice: 0` or NaN — validator must reject 400.
- `features: ["…long-string × 500 chars…"]` — validator caps at 60 chars.
- Lead with only grade-D evidence for `beds` — `matchesCriteria` must NOT
  pass on that field (no naked numbers).
- Two watchers same agent same lead — both can match (different criteria);
  idempotency key includes `watcherId` so they don't collide.
- Concurrent cron ticks (Vercel can double-fire) — `claimEvent`'s unique
  `(agent_id, idempotency_key)` row prevents double-drafting.
- 10k leads × 50 watchers tenant — cap via `maxHits` (default 100, ceiling
  500). Returns `capped:true` and the next tick continues. Document the cap
  in the route response.
- Watcher referencing a deleted lead surface — `listLeads` already excludes
  it; nothing to do.

**Verification evidence:**
- `npm run typecheck && npm run lint && npm test` (gate).
- `bash scripts/smoke.sh` extended: POST watcher → POST cron with bearer →
  GET inbox should contain a draft whose `trigger` includes the watcher id.
- Supabase MCP: `select count(*) from domain_event where idempotency_key like 'watcher-hit:%' and agent_id = $1` before/after a re-run should be equal.
- Manual: `/loops` page (Loop Studio) shows new runs under "Buyer watcher".

**Cost / context budget:**
- Phase budget: ~1 plan + ~5 implement turns + ~2 verify turns.
- No paid model calls in the hot path — the buyer-watcher loop uses
  `composeBest` which already falls back deterministically if `claudeLive`
  is off. Sweep itself is pure deterministic predicate over local rows.
- Context sources: this packet, `engine.ts`, `scheduler.ts`,
  `supabase-repo.ts` Watcher block. No need to re-read whole `types.ts`.

**Risks / gotchas (`→ playbook.md`):**
- Seed-id collision — `Watcher.id` is generated by Supabase
  `uuid_generate_v4()` so no `workspaceSeedId` needed (no slug). Confirmed.
- IDOR — never read `agent_id` from request body in PATCH/DELETE; always
  load the row and compare against `requireAgentId()`.
- Vitest cross-test bleed — sweep test must scope to a fresh in-memory
  repo (use `createInMemoryRepo()` factory used by `engine.test.ts`).
- Vercel cron double-fire — handled by `claimEvent` idempotency key; do not
  short-circuit `claimEvent` for "performance" in the sweep.
- No naked numbers — `criteria.matchesCriteria` reads from
  `EvidenceCard.confidence` and refuses grade D as a match source; the
  generated `found_one` draft inherits this via the existing pipeline.

**Rollback plan:**
- All new code is additive (new files + one cron wire-up). Revert with a single
  `git revert <merge-sha>` — no destructive migration, no data backfill.
- If only the sweep misbehaves in prod (e.g. produces noisy drafts): set every
  `watcher.active = false` via Supabase MCP (`update watcher set active=false`)
  — the sweep then no-ops without redeploy. Pre-existing artifacts stay in the
  inbox unsent (human approval gate intact).
- If the cron hook needs to be disabled but the API kept: comment-out the
  `runWatcherSweep` call in `src/app/api/cron/loops/route.ts` and redeploy.
- Migration 0011 (if added) is `create index if not exists` — safe to drop with
  `drop index if exists` and no data loss.

**Human-in-the-loop:**
- No new secrets. Uses existing `CRON_SECRET` for the cron entry.
- No external comms — drafts stay in the Review Tray (UC-4 closes the loop
  at "Review Tray", not "Sent").
- Approval gate: each "found one" email goes through the existing approve
  route, which is the right place for the human to review the buyer-side
  copy.

**Done criteria:**
- [ ] `POST /api/watchers` creates a Watcher; `GET /api/watchers` lists it;
      `PATCH` toggles `active`; `DELETE` soft-deactivates.
- [ ] Cron tick produces a draft artifact for a matching lead and zero for
      non-matching leads.
- [ ] Idempotent: second cron tick same day with no new matches creates zero
      new artifacts (verified via `domain_event` count and inbox count).
- [ ] IDOR test passes: cross-tenant PATCH returns 404; anon POST → 401.
- [ ] Loop Studio observability payload includes the new runs.
- [ ] `npm run agent:check -- --risk=medium` green.
- [ ] PR body includes a Playwright video walking: create watcher → run
      cron (button or `curl -H Bearer`) → see draft in Review Tray.

**Dependencies (other ws-*.md):**
- **WS-A · Live property/owner data adapter.** Watchers match against
  EvidenceCard claims on LeadSurfaces. With only the mock provider, matches
  on `beds`/`maxPrice` are limited to seeded leads. WS-A must deliver:
  EvidenceCards for `bedrooms` and `last_sale_price` (or comparable value)
  with confidence ≥ C. Without WS-A, demo coverage is restricted to seeded
  Lapa fixtures.
- **WS-D · Onboarding "10-min CRM" (UC-5).** Watchers need
  LeadSurfaces in the workspace to be useful. WS-D delivers seeded farm
  leads from onboarding. Soft dep (mock seed covers v1 demo).
- *Not blocked by:* WS-E (CRM overlay), WS-G (GPS farming), WS-J (real
  send) — Watchers v1 produces drafts only.

**Estimated hours (solo-founder pace):** **6 h**
- 1 h criteria + tests
- 1 h sweep + tests
- 1 h API routes + auth-guard tests
- 0.5 h cron wire + summary merge
- 0.5 h validator
- 1 h integration smoke + playwright video
- 1 h gates + PR write-up (with feedback-questions block per memory rule)

**Open decisions (need human / next-session input):**
- Area predicate v1: `area_label` string equality vs `BuyerCriteria.district`
  exact match vs polygon-contains-point. Defaulting to string equality on
  `area_label === lead.address.district` (or fallback to `district` criteria
  string). Confirm before implementing? (Asked separately as
  AskUserQuestion later.)
- Default cadence: every-day vs every-6-hours. Vercel cron tier may cap us;
  pick one default.
- Should watcher hits also produce an in-app push/toast in addition to the
  Review Tray draft? (Currently: Review Tray only, per UC-4 "pings the
  agent with a ready-to-send message".)
