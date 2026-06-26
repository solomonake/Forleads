# Plan: Live loop observability

**Goal:** Loop Studio shows whether scheduled loops are healthy, due, or stale
using existing persisted loop runs and grounded lead labels.

**Why / value:** Scheduled loops now run in production, but operators need a
trust surface inside the app instead of reading Vercel logs.

**User / job:** A real-estate agent or operator wants to know whether follow-up
automation is actually keeping up with their leads.

**Pain evidence:** `GET /api/loops` returns definitions, raw runs, and aggregate
analytics, but it does not answer "what is due now?", "when did this last run?",
or "which lead did the last run touch?"

**Current → desired behavior:** Loop Studio lists raw run IDs and counts →
Loop Studio also shows per-loop schedule health, next due timing, last run
status, and lead addresses for recent runs.

**Non-goals:** No scheduler execution changes, no new cron cadence, no connector
writes, no production data migration, and no new paid service.

**Risk tier:** medium — read-only product behavior over persisted loop data.

**Context links:** `src/components/LoopStudio.tsx`,
`src/app/api/loops/route.ts`, `src/lib/loops/scheduler.ts`,
`src/lib/db/repository.ts`, `.agent/playbook.md`.

**Seams & exact files:**
- Add pure derivation in `src/lib/loops/observability.ts`.
- Return the derived payload from `src/app/api/loops/route.ts`.
- Render the summary in `src/components/LoopStudio.tsx`.
- Test derivation in `src/lib/loops/observability.test.ts`.

**Steps:**
1. Derive loop summaries from definitions, leads, runs, and current time.
2. Include `leadLabels` and `observability` in the loops API response.
3. Render schedule health and recent run lead labels in Loop Studio.
4. Add tests for due, waiting, unscheduled, and empty-lead states.
5. Run targeted tests plus typecheck and lint.

**Acceptance scenarios:** scheduled loop with no runs shows due now; scheduled
loop with a fresh run shows next due; unscheduled active loop shows event-driven;
paused loop shows paused; recent runs display lead address when known and a
fallback when unknown.

**Break plan:** invalid dates, no leads, no runs, unknown lead IDs, inactive
definitions, and zero/undefined cadences must not crash UI or API.

**Verification evidence:** `npm test -- src/lib/loops/observability.test.ts`,
`npm run typecheck`, `npm run lint`.

**Cost / context budget:** No paid calls. Keep reads bounded to existing
`GET /api/loops` data.

**Risks / gotchas:** Do not create naked metrics without context; every count
must be tied to persisted runs/leads. Do not imply a scheduled run will auto-send.

**Human-in-the-loop:** None expected; this is read-only UI/API behavior.

**Done criteria:** Branch pushed, PR created, tests pass, and Loop Studio exposes
the scheduled-loop trust surface without changing scheduler execution.
