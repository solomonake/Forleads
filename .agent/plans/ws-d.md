# Plan: WS-D · Onboarding "10-min CRM" wizard (UC-5)

> Model-agnostic. Everything a model needs is here. The seams already exist
> (geocoder, `ensureLead`, scout swarm, repo). The new code is a thin wizard
> that orchestrates them, gated by a one-shot `agent.onboarded_at` marker.

**Goal:** A first-run agent picks a farm area on the map, drops a CSV of contacts,
and within ~10 minutes lands on the map with ≥1 (target: 20) graded Lead
Surfaces visible and a pre-warmed swarm cached for the top 20. The honest empty
state becomes an honest populated state — no demo data, no Marcus Lee.

**Why / value:** UC-5 — new agents quit because they stare at an empty CRM.
First-run time-to-first-grounded-lead is the supporting north-star metric
(`docs/Forleads_Vision_v1.md:58`). The Friday client launch
(`memory/friday-client-launch.md`) needs a non-demo first-run path.

**User / job:** Brand-new agent, no CRM, just signed in via Google. Wants the
map populated with *their* people, geocoded, graded, in minutes — not hours of
data entry.

**Pain evidence:**
- `docs/Forleads_UserCases_v1.md:31-35` — "stares at an empty CRM; data entry hell; quits."
- `memory/product-stance-no-mockups.md` — honest empty states only; we cannot
  ship demo seeds to fill the void.
- Memory: real-estate client onboards 2026-06-25 — without WS-D they hit the
  empty map (`memory/friday-client-launch.md`).

**Current → desired behavior:**
- *Before:* `src/app/page.tsx:24` mounts straight to `MapWorkspace`; first-run
  agent sees an empty map with no leads. CSV import does not exist. No farm
  area concept persisted per agent.
- *After:* On first login, `/onboarding` wizard runs three steps —
  (1) draw/select farm bbox on map, (2) upload CSV (or skip), (3) preview +
  confirm. On confirm: contacts are geocoded, `ensureLead` creates lead
  surfaces, scouts pre-warm for the top 20 by signal strength, agent is
  redirected to `/` with the map auto-flying to the farm bbox. Marker on the
  agent row prevents re-entry; an explicit "Re-run onboarding" lives in
  Account Bar.

**Non-goals:**
- CRM overlay sync (FUB/GHL) — that is WS-E.
- Phone-contacts native import (iOS/Android permissions) — CSV first, native
  shim is a follow-up.
- Real-time CSV streaming for >5k rows — cap at 2,000 rows for v1 with a clear
  banner. A bigger ingest job is a separate plan.
- Watchers over the farm area — that is WS-F.

**Risk tier:** medium. No payment, no destructive migration, no auto-send. It
DOES persist new rows (lead_surface, possibly contact ledger) and burns the
Overpass/geocode budget — so capacity envelope (per
`memory/prod-hardening.md` axis: rate-limit B) needs explicit throttling.
Promotes to **high** if it touches `auth/agent.ts` for the onboarding marker
in a way that changes the tenant-derivation path (it should NOT — see
"Seams").

**Context links:**
- `docs/Forleads_UserCases_v1.md:31-35` (UC-5)
- `docs/Forleads_Vision_v1.md:58,68` (north-star + Month 1 promise)
- `.agent/playbook.md` — seam pattern, no naked numbers, fail-closed, OSM UA,
  vitest single-fork, mock-write hardening
- `src/app/api/lead/route.ts:1-53` — model for a tenant-scoped, rate-limited,
  validated mutating route
- `src/lib/pipeline.ts:81-103` (`ensureLead`), `:151` (`runSwarm`)
- `src/lib/providers/types.ts:18-23` (`GeocodeProvider` — the seam already
  exists; reuse, do not re-invent)
- `src/app/api/geocode/route.ts:1-9` — current geocode autocomplete route
- `src/lib/auth/agent.ts` — `requireAgentId()` / `ensureCurrentAgent()`
- `src/lib/ratelimit/index.ts` — `enforceRateLimit`
- `src/lib/validation/index.ts` — `validateBody`, `str`, `num`
- `src/components/MapWorkspace.tsx` — map mount + `flyTo` surface
- `src/components/AccountBar.tsx` — where the "Re-run onboarding" entry goes

**Seams & exact files:**

*New files (verified missing via `ls`):*
- `src/app/onboarding/page.tsx` — client wizard shell (3 steps + progress).
- `src/app/onboarding/layout.tsx` — bare layout (no nav rail).
- `src/components/onboarding/FarmAreaStep.tsx` — map + bbox draw (reuses
  `MapWorkspace`'s maplibre instance via a thin draw overlay).
- `src/components/onboarding/CsvImportStep.tsx` — drop zone + column-mapping
  preview (uses Papa Parse, already a transitive dep — verify; otherwise add).
- `src/components/onboarding/ConfirmStep.tsx` — preview top-20 + "Build my CRM".
- `src/components/onboarding/ProgressBus.tsx` — SSE/poll-driven progress.
- `src/app/api/onboarding/start/route.ts` — POST: stamp
  `agent.onboarded_started_at`, persist farm bbox, return job id.
- `src/app/api/onboarding/import/route.ts` — POST: validated, rate-limited CSV
  batch ingest (server-parsed; client only previews). Hard cap 2,000 rows.
  Idempotent on `(agent_id, normalized_address)`.
- `src/app/api/onboarding/status/route.ts` — GET: progress (geocoded n/total,
  prewarmed n/20, errors).
- `src/app/api/onboarding/finish/route.ts` — POST: stamp `onboarded_at`,
  return `{ farmBbox, topLeadIds }`.
- `src/lib/onboarding/orchestrator.ts` — pure-function pipeline:
  parse → normalize → geocode (batched, throttled) → `ensureLead` →
  rank-by-signal → `runSwarm` for top 20. Emits domain events
  (`onboarding.row_geocoded`, `onboarding.lead_prewarmed`).
- `src/lib/onboarding/csv.ts` — column detection + row normalization, returns
  `{ name, phone?, email?, address }`; refuses rows with no address.
- `src/lib/onboarding/orchestrator.test.ts` — fixture CSV (10 rows: 1 happy, 1
  empty address, 1 malformed phone, 1 duplicate, 1 geocoder failure) drives
  the full pipeline against `mock` providers.
- `src/lib/onboarding/csv.test.ts` — header detection, BOM, semicolon delim,
  malformed rows.

*Edited files:*
- `src/lib/db/repository.ts` — add `agentOnboardedAt(agentId)` /
  `markAgentOnboarded(agentId, { bbox, startedAt })` to the `Repo` interface
  and both adapters; add `farm_bbox` and `onboarded_at` columns via migration.
- `src/lib/db/supabase-repo.ts` — implement the two methods + bbox
  upsert (no PostGIS — store as `jsonb` of `[w,s,e,n]`; geometry is
  presentational, not queried geographically here).
- `supabase/migrations/0011_agent_onboarding.sql` — `alter table agent add
  column onboarded_at timestamptz, farm_bbox jsonb, onboarded_started_at
  timestamptz`. RLS already scoped by `agent_id`; re-run `get_advisors`
  per playbook line 21.
- `src/app/layout.tsx` (or a server component wrapper for `src/app/page.tsx`)
  — server-side redirect to `/onboarding` when session exists and
  `agentOnboardedAt(agentId)` is null. **Do not** read `agentId` from
  request input (playbook gotcha line 47).
- `src/components/AccountBar.tsx` — add "Re-run onboarding" menu item that
  hits `/api/onboarding/reset` (deliberately omitted from v1 — see open
  decisions).
- `src/components/MapWorkspace.tsx` — accept an optional `initialBbox` prop;
  on mount, `flyToBounds` to it if provided. Wire from `page.tsx`.

**Steps:**
1. Add migration + extend `Repo` interface (mock + supabase) with onboarded
   marker. Test both adapters round-trip.
2. Implement `src/lib/onboarding/csv.ts` + tests (pure, deterministic, no I/O).
3. Implement `src/lib/onboarding/orchestrator.ts` against the existing
   `GeocodeProvider` + `ensureLead` + `runSwarm` seams. Throttle geocode to
   `≤5 req/s` per agent; cap total to 2,000 rows; cap pre-warm at top 20
   ranked by `(hasPhone?1:0)+(hasEmail?1:0)+(addressSpecificity)`.
4. Wire the four API routes. Each route: `withRoute(...)`,
   `requireAgentId()`, `enforceRateLimit({ name:"onboarding-*", perAgent: 3,
   perIp: 6 })`, `validateBody`. CSV ingest streams rows from
   `req.formData()`; never trusts client-supplied geocodes.
5. Build the wizard UI (`/onboarding/page.tsx` + 3 step components). Each
   step uses the existing `MapWorkspace` instance where possible; bbox draw
   is a maplibre `Draw` thin layer.
6. Add the server-side gate in `src/app/page.tsx` (or a wrapper) — read
   `agentOnboardedAt` and `redirect("/onboarding")` if null.
7. Pass `initialBbox={farmBbox}` and `initialLeadIds={topLeadIds}` into
   `MapWorkspace` so the post-onboarding landing flies to the farm.
8. Verification: `npm run typecheck`, `npm run lint`, `npm test`, then
   `npm run dev` + `bash scripts/smoke.sh`. Playwright video covering
   first-run from `/` → `/onboarding` → 3 steps → back to `/` with populated
   map (per `memory/video-in-pr-required.md`).
9. Run Supabase MCP `get_advisors` after the migration applies (playbook).

**Acceptance scenarios:**
- *Happy:* New agent, 200-row CSV with full addresses → wizard completes in
  ≤10 min wall-clock against mock providers; map lands on farm bbox; ≥20
  leads visible; top-20 swarm cache hit on click.
- *Skip CSV:* Agent draws farm bbox, skips CSV → finishes onboarding with
  `farm_bbox` saved + 0 leads (honest); map flies to bbox; no demo seed.
- *Empty CSV / malformed CSV:* 4xx with a specific operator-facing error
  ("no `address` column detected"); no partial writes.
- *Geocoder failure mid-batch:* Successfully-geocoded rows persist;
  unresolved rows enter a "needs review" list; agent can re-run from the
  AccountBar entry.
- *Re-entry:* Once `onboarded_at` is set, `/onboarding` either redirects to
  `/` or 200s with "already onboarded" copy (no destructive re-run unless
  opt-in via the menu).
- *Tenant isolation:* Two agents onboarding in parallel never see each
  other's leads. Vitest integration runs with `fileParallelism:false` per
  playbook line 50 — keep it.
- *Capacity:* 4th simultaneous onboarding from one agent in <1 min is
  throttled with a graceful banner, not 500s.

**Break plan:**
- CSV with BOM, semicolon delim, mixed quoting, embedded newlines.
- 2,001-row file → 4xx with row-count error before any persistence.
- Same address present twice → single `lead_surface` (dedup by normalized
  address).
- Geocode provider 500 / 429 / timeout — orchestrator falls back to D-grade
  gap card on the row, does NOT poison the whole batch (graceful
  degradation invariant).
- Agent disconnects mid-job — the job is idempotent on `(agent_id, normalized_address)`;
  resuming finishes the remainder.
- Replay attack: re-POST the same `/start` with a different bbox while a
  prior job is still running → reject with 409.
- Session forged with another agent's `onboarded_at=null` → server gate
  recomputes from `requireAgentId()`; never from client state.

**Verification evidence:**
- `npm run typecheck && npm run lint && npm test` all green.
- `npm run agent:check -- --risk=medium` passes.
- `scripts/smoke.sh` + `preview_screenshot` of `/onboarding` step 1, 2, 3
  and `/` populated.
- Supabase MCP: `execute_sql "select agent_id, onboarded_at, farm_bbox from
  agent where onboarded_at is not null limit 5"` round-trips.
- Supabase MCP `get_advisors` returns no new findings after migration.
- Playwright video recording attached to PR top fold
  (`memory/video-in-pr-required.md`).

**Cost / context budget:**
- Implementation phase: ≤40k context tokens; no Claude calls in onboarding
  path (the pre-warm uses existing scout swarm which has its own budget).
- Geocode budget: max 2,000 rows × 1 call = 2,000/agent/run, throttled to
  ≤5 rps. Pre-warm: 20 swarms; reuse the existing scout cache layer
  (`src/lib/agents/scouts.cache.test.ts`).
- Paid-call cap: stay on mock providers in test; live OSM/geocode only in
  manual smoke.

**Risks / gotchas:**
- *Playbook line 39 (OSM UA):* any new Overpass/Nominatim call MUST send a
  `User-Agent`. Orchestrator must reuse the existing provider, not raw fetch.
- *Playbook line 41 (workspace seed ids):* do NOT generate stable per-tenant
  ids from globally-stable slugs. Onboarding writes use `uuid()` for
  `lead_surface.id`.
- *Playbook line 42 (mock writes off in prod):* CSV ingest is data, not a
  connector write, so allowed in prod — but pre-warm scouts must not flip
  any approval/draft side effect. Audit before merge.
- *Playbook line 43 (PostGIS):* `farm_bbox` is plain `jsonb`, NOT a
  geography column — we never spatial-query it.
- *Playbook line 47 (server-derived tenant):* the gate redirect runs on
  server, derives `agentId` from session only. Never accept it from query/body.
- *Playbook line 48 (vi.fn rejecting):* orchestrator tests mock the
  geocoder with a plain function returning a rejected promise via an
  explicit `.catch`, not `vi.fn().mockRejectedValue`.
- *Playbook line 49 (Next 15 `cookies()` async):* the server gate must await
  the session helper.
- *Memory `product-stance-no-mockups.md`:* if CSV is empty AND no bbox is
  drawn, the map remains an honest empty state. No demo Marcus Lee.
- *Memory `feedback-before-merge.md`:* before merging the PR, post 3–6
  specific feedback questions about the wizard copy + step ordering and a
  Vercel toolbar CTA; resolve threads before merge.

**Human-in-the-loop:**
- No new secrets. Uses existing `GeocodeProvider` (mock by default, live via
  the env var already wired in `src/lib/core/config.ts` — playbook line 7).
- Migration `0011_agent_onboarding.sql` runs via existing Supabase migration
  flow; no human secret rotation.
- PR description = junior-to-senior handoff with Playwright video at the top
  fold (`memory/pr-as-handoff-with-video.md`,
  `memory/video-in-pr-required.md`).

**Done criteria:**
- [ ] Migration applied; `get_advisors` clean.
- [ ] All API routes typed, validated, rate-limited, tenant-derived from session.
- [ ] Orchestrator unit tests cover happy / empty / malformed / dup /
      geocode-fail.
- [ ] Server-side first-run gate redirects fresh sessions to `/onboarding`
      and stays out of their way afterwards.
- [ ] Honest empty state preserved when agent skips CSV.
- [ ] Playwright video in PR top fold; smoke screenshots attached.
- [ ] `npm run agent:check -- --risk=medium` green.
- [ ] 3–6 feedback questions posted on the PR per
      `memory/feedback-before-merge.md`.
