# Plan: Durable scheduled loop runner

**Goal:** Active cadence-based loops prepare due work automatically once per
day, with tenant isolation, retry-safe claims, bounded execution, inspectable
runs, and no automatic connector writes.

**Why / value:** Loop Studio currently requires “Run now.” The core product
promise is that follow-up keeps moving after the agent leaves the app.

**User / job:** A real-estate agent wants stale leads reviewed and compliant
follow-up drafts prepared without remembering to reopen Forleads.

**Pain evidence:** `src/app/api/loops/route.ts` exposes only a manual POST.
`LoopDefinition.cadence.everyDays` is rendered in the UI but no scheduler
consumes it.

**Current → desired behavior:** Cadence is descriptive only → Vercel calls an
authenticated cron route daily, the runner finds due loop/lead pairs, claims
each pair once per UTC day, runs bounded draft-only work, and records proof.

**Non-goals:** Auto-send, minute-level schedules, watcher polling, buying a
queue, or adding a new paid service.

**Risk tier:** high — cross-tenant background execution and production cron.

**Context links:** `AGENTS.md`, `.agent/AGENT_OS.md`,
`src/lib/loops/engine.ts`, `src/lib/db/repository.ts`,
`src/app/api/loops/route.ts`, Vercel Cron Jobs guidance.

**Seams & exact files:**
- Repository: list agents and atomically claim a domain-event idempotency key.
- Scheduler: select cadence definitions, evaluate due windows, cap runs, and
  reuse `runLoop`.
- Route: `GET /api/cron/loops`, Bearer `CRON_SECRET`, structured response.
- Deployment: `vercel.json`, daily UTC schedule.
- UI: Loop Studio labels scheduled cadence honestly.

**Steps:**
1. Add repository methods in both in-memory and Supabase implementations.
2. Add deterministic UTC-day claim keys and due-selection helpers.
3. Implement bounded `runScheduledLoops`, including error runs.
4. Add the fail-closed cron route and Vercel schedule.
5. Add unit/route tests for auth, due selection, dedupe, and retry next day.
6. Run high-risk gates and production probes.

**Acceptance scenarios:** due stale lead runs; fresh lead skips by condition;
same-day retry dedupes; next-day retry can run; missing/incorrect secret is 401
or 503; no connector write occurs; max-run cap is honored.

**Break plan:** concurrent duplicate claim, missing secret, malformed limit,
repository failure, one lead throwing while others continue.

**Verification evidence:** targeted Vitest, `npm run agent:check -- --risk=high`,
production build, authenticated production cron probe.

**Cost / context budget:** One daily serverless invocation; maximum 25 loop runs
per invocation; no connector side effects and no new paid service.

**Risks / gotchas:** Every Repository method must exist in memory and Supabase.
Never enumerate cross-tenant data in a user route. Cron only prepares artifacts.

**Human-in-the-loop:** `CRON_SECRET` must exist in Vercel before the production
cron route can be exercised.

**Done criteria:** Code and tests merged; Vercel deploy contains the cron;
authorized production probe returns a bounded summary; Loop Studio shows that
cadence is scheduled rather than implying manual-only operation.
