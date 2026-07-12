# Plan: Product completion loop

> Model-agnostic. This plan turns the six remaining product gaps into a
> repeatable loop: plan, gap-check, implement the safest highest-leverage phase,
> test, QA, record what remains, and continue until gates are clean or a human
> boundary is reached.

**Goal:** Forleads reaches a production-proven operating loop: a signed-in user
can move from map/address evidence to approved action, real connector write,
outcome memory, scheduled follow-up, and an inspectable report, with every
missing live dependency shown as setup-required rather than hidden or mocked.

**Why / value:** The architecture is no longer the main risk. The remaining
risk is product credibility: a partner or real agent must see a trustworthy
workflow, not a strong prototype with unclear integration gaps.

**User / job:** Active solo agent or small team operator trying to turn property
touches, field notes, CRM records, and follow-up rules into compliant work that
lands in their real tools after approval.

**Pain evidence:**
- Current checkpoint says the branch is dirty and full typecheck is blocked by
  `src/lib/field-scout.test.ts` and `src/lib/providers/real.ts`.
- Current product plan says the app needs an end-to-end lead intelligence loop,
  provider readiness, setup-required connector states, and operator-facing
  workflow surfaces.
- Production health can be live while real user proof remains unverified; health
  is necessary, not sufficient.

**Current -> desired behavior:**
- Dirty partial branch -> clean, gated branch with one checkpoint per phase.
- Map-and-draft flow -> full loop: lead discovery, grounded facts, action draft,
  approval, connector result, outcome memory, scheduler/report.
- Generic setup gaps -> exact setup-required cards and Connector Hub actions.
- Internal-looking screens -> operator workflow surfaces that answer "what makes
  money next?" and "why can/can't this action run?"
- Local proof only -> targeted local gates plus live-safe probes; any missing
  credentials are stated as blocked, not treated as success.

**Non-goals:**
- No auto-send of email, SMS, or external communication.
- No purchase of provider accounts, paid data, or new infrastructure.
- No destructive production mutations or secret rotation without approval.
- No claiming PropStream, MLS, skip-trace, or unavailable market data exists.
- No rewriting the app around a new framework or agent stack.

**Risk tier:** High. This touches connectors, live provider posture,
tenant-scoped persistence, human approval, scheduled loops, and user-facing
production claims. Critical actions such as production mutation, deploy, merge,
secret changes, or external communication remain human-approved.

**Context links:**
- `AGENTS.md`
- `.agent/AGENT_OS.md`
- `.agent/playbook.md`
- `.agent/decisions.md`
- `.agent/handoffs/current.md`
- `.agent/plans/agentic-loop-data-integrations.md`
- `.agent/plans/scheduled-loop-runner.md`
- `.agent/plans/live-only-production.md`
- `docs/Forleads_ProductionMarketPlan_v1.md`
- `docs/Forleads_Vision_v1.md`
- `src/lib/core/config.ts`
- `src/lib/connectors/index.ts`
- `src/lib/providers/readiness.ts`

**Seams & exact files by phase:**

1. **Stabilize branch and gates**
   - `src/lib/field-scout.ts`
   - `src/lib/field-scout.test.ts`
   - `src/lib/providers/real.ts`
   - `src/lib/providers/real.test.ts`
   - `.env.example`
   - `.agent/handoffs/current.md`

2. **Complete production action loop**
   - `src/lib/pipeline.ts`
   - `src/lib/loops/engine.ts`
   - `src/lib/loops/scheduler.ts`
   - `src/app/api/notes/route.ts`
   - `src/app/api/approve/route.ts`
   - `src/app/api/seller-update/route.ts`
   - `src/app/api/cron/loops/route.ts`
   - `src/lib/agents/outcome*.ts`
   - `src/lib/agents/memory.ts`

3. **Prove real external hero path**
   - `src/lib/connectors/gmail.ts`
   - `src/lib/connectors/calendar.ts`
   - `src/lib/connectors/followupboss.ts`
   - `src/lib/connectors/gohighlevel.ts`
   - `src/lib/connectors/twilio.ts`
   - `src/lib/connectors/zapier.ts`
   - `src/lib/connectors/index.ts`
   - `src/app/api/connectors/route.ts`
   - `src/app/api/approve/route.test.ts`

4. **Complete provider/data depth**
   - `src/lib/providers/readiness.ts`
   - `src/lib/providers/index.ts`
   - `src/lib/providers/real.ts`
   - `src/lib/providers/mock.ts`
   - `src/lib/agents/scouts.ts`
   - `src/lib/agents/dispatcher.ts`
   - `src/components/ConnectorHub.tsx`

5. **Productize operator surfaces**
   - `src/components/MapWorkspace.tsx`
   - `src/components/Pipeline.tsx`
   - `src/components/ActionInbox.tsx`
   - `src/components/LoopStudio.tsx`
   - `src/components/ConnectorHub.tsx`
   - `src/components/AgentTraceDrawer.tsx`
   - `src/app/globals.css`

6. **Operational hardening and QA loop**
   - `package.json`
   - `vitest.config.ts`
   - `scripts/agent-check.mjs`
   - `scripts/smoke.sh`
   - `.agent/evals/corpus.v1.json`
   - `.agent/metrics/runs.jsonl`
   - `.agent/handoffs/current.md`

**Execution phases:**

1. **Phase A: Mechanical stability.**
   - Resolve known typecheck blockers.
   - Run targeted tests for touched files.
   - Run `npm run agent:check -- --risk=medium`.
   - Exit criteria: no local compile blocker remains from the current dirty
     branch; any remaining failure is named with file, command, and next action.

2. **Phase B: Plan gap-check and QA matrix.**
   - Build a checklist covering happy, empty, failure, recovery, responsive,
     compliance, setup-required, tenant, retry, idempotency, and observability.
   - Verify every item maps to a file, test, or live probe.
   - Exit criteria: no orphan requirement exists without an owner or stop rule.

3. **Phase C: Loop completeness.**
   - Verify note -> classification -> artifact -> approval -> connector result
     -> outcome memory -> next loop run/report.
   - Fill missing tests where the chain is not covered.
   - Exit criteria: a deterministic local test proves the whole loop without
     external side effects.

4. **Phase D: Connector/live proof.**
   - Verify production policy disables mock connector success.
   - Test setup-required responses for missing CRM/SMS/webhook credentials.
   - If Google OAuth credentials and user session are available, create a real
     Gmail draft after approval; otherwise record exact human setup required.
   - Exit criteria: live path is proven or explicitly blocked by missing human
     auth/secret, with no fake success.

5. **Phase E: Provider depth and data honesty.**
   - Verify each provider readiness row matches the actual env/config seam.
   - Add/repair tests for open sales, distress, hazard, buildings, field-scout,
     consent-first contact, automation, and CRM setup states.
   - Exit criteria: cards and Connector Hub state do not imply unavailable data.

6. **Phase F: Operator UX QA.**
   - Run local dev server with approved Node.
   - Exercise map, pipeline, action inbox, connector hub, loop studio, trace, and
     responsive states with browser QA.
   - Exit criteria: no overlapping text, no dead primary workflow, no misleading
     status language, and setup-required states are visible.

7. **Phase G: Production-safe verification.**
   - Probe `/api/health`.
   - Probe read-only production endpoints where allowed.
   - Do not deploy, merge, mutate production, or externally communicate without
     approval.
   - Exit criteria: production-readiness report separates verified live facts
     from local proof and blocked human actions.

8. **Phase H: Score, checkpoint, and repeat.**
   - Record scorecard after each meaningful phase.
   - Refresh `.agent/handoffs/current.md` with completed work, proof, blocker,
     and next exact action.
   - If anything remains that is safely actionable, loop back to Phase A with the
     next highest-leverage gap.
   - Stop only at clean gates or a hard human boundary.

**Acceptance scenarios:**
- Happy: signed-in user searches an address, gets sourced evidence, creates a
  note, sees a compliant draft, approves the reviewed revision, and gets a
  connector result plus trace.
- Empty: no open sales/distress/hazard feed configured produces setup-required
  intelligence gaps, not invented facts.
- Failure: missing CRM/SMS/webhook credentials return client-safe setup-required
  errors; artifact remains unapproved or not externally written.
- Recovery: connector retry/idempotency avoids duplicate writes; stale revisions
  return conflict.
- Responsive: map workspace, action inbox, pipeline, connector hub, loop studio,
  and trace remain usable on mobile and desktop.
- Tenant: no route accepts client-provided `agentId` for scoped reads/writes.
- Compliance: prohibited wording blocks approval or suggests a safe revision.
- Observability: every route involved has request id/log/trace evidence.

**Break plan:**
- Malformed JSON, missing fields, oversized notes, bad enum values.
- Approval of a stale artifact revision.
- Approval of a compliance-blocked artifact.
- Missing Google token, expired Google token, no CRM key, no SMS key.
- Duplicate cron invocation and duplicate approval clicks.
- Public-data feed unavailable, timeout, bad CSV, unmatched address.
- Anonymous mutation attempt and demo-user mutation boundary.
- Map/provider network failure and live provider 4xx/5xx.
- Mobile viewport text overflow on primary surfaces.

**Verification evidence:**
- `npm run agent:doctor` -> 0 blocking.
- `npm run typecheck` -> exits 0.
- `npm run lint` -> exits 0.
- `npm test` -> exits 0.
- Targeted tests for each changed seam -> exits 0.
- `npm run agent:check -- --risk=high` -> exits 0 before PR-ready claim.
- `curl -sS -D - https://forleads.vercel.app/api/health` -> confirms current
  production policy and live-mode violations.
- Browser QA screenshots for desktop and mobile after UI edits.

**Cost / context budget:**
- No paid calls by default.
- One production `/api/health` probe per verification loop.
- No live connector write unless the user has authenticated and the flow is
  approval-gated.
- Worker context stays to shared docs, this plan, one phase's files, and current
  checkpoint.

**Risks / gotchas:**
- Local Node is currently newer than repo policy; use approved Node 20/22 for
  final gates when possible.
- Local production build has historically stalled on MapLibre; prefer dev smoke
  plus CI/Vercel proof unless a build finishes conclusively.
- Do not present mock connector success as production success.
- Do not change legacy deterministic UUID helpers in a way that orphans prod
  rows.
- Avoid parallel typecheck/build because `.next` generated types are mutable.

**Human-in-the-loop:**
- Needed for Google OAuth session proof if no signed-in session exists.
- Needed for CRM/SMS/webhook credentials.
- Needed for deployment, merge, production mutation, secret rotation, spend, or
  external communication.
- If blocked, record exact env names and test command, then continue with local
  fail-closed proof.

**Done criteria:**
- All six areas are complete or explicitly blocked by a human boundary.
- High-risk gate passes, or every failing gate has a named file/root cause and
  next action.
- Production health is checked and reported with concrete mode values.
- At least one end-to-end deterministic loop test proves the product workflow.
- Live connector proof is either completed with real user approval or honestly
  marked blocked by missing human auth/credentials.
- UI QA covers desktop and mobile primary surfaces.
- `.agent/handoffs/current.md` and a scorecard/run record name what changed,
  what passed, what remains, and the next exact action.

---

## Phase B gap-check matrix (completed 2026-07-03)

Every QA dimension maps to an owner (test file or probe). Verified against the
suite that `npm test` runs green.

| Dimension | Owner (test / probe) |
|---|---|
| Happy path (note→draft→approve→connector→trace) | `src/lib/loop-completeness.test.ts` (full chain), `src/app/api/notes/route.test.ts` (real note route front door), `src/lib/loops/engine.test.ts` (draft→approve, trace per draft) |
| Classification | `src/lib/agents/notes.test.ts`, `src/app/api/notes/route.test.ts` |
| Empty / honest gaps | `src/lib/scout-fanout.degrade.test.ts`, `src/lib/agents/memory.degrade.test.ts`, `src/lib/providers/real.test.ts` (not-configured D-cards), `agent:eval` invariants `honest-risk-gap` + `honest-risk-scout-fallback` |
| Setup-required / failure | `src/app/api/approve/route.test.ts` (connector setup failure surfaced), `src/lib/connectors/live-only.test.ts` (no mock success in prod) |
| Recovery: stale revision | `src/lib/artifacts/revise.test.ts` (stale approval rejected, compliance rerun) |
| Retry / idempotency | `src/lib/connectors/idempotency.test.ts`, `engine.test.ts` (double-approve dedup), `revise.test.ts` (revision in idempotency key) |
| Tenant isolation | `src/app/api/auth-guard.test.ts`, `src/lib/auth/agent.test.ts`, `src/lib/db/seed.test.ts` (per-workspace seed ids) |
| Compliance | `src/lib/agents/compliance.test.ts`, fail-closed approve in `pipeline.ts` (blocked artifacts unapprovable, asserted in outcome tests) |
| Outcome memory | `src/lib/agents/outcome.test.ts`, `outcome-v2.test.ts` (recall + priorOutcomes in trace), `outcome-emit.test.ts` |
| Scheduler / next run | `src/lib/loops/scheduler.test.ts`, `src/app/api/cron/loops/route.test.ts` |
| Report / observability | `src/lib/loops/analytics.test.ts`, `src/lib/observability/index.test.ts`, `src/lib/events.test.ts` |
| Validation / rate limit | `src/lib/validation/index.test.ts`, `src/lib/ratelimit/index.test.ts` |
| Responsive / UX | Phase F browser QA (`preview_start` + screenshots) — cannot be a unit test; stop rule: no merge-claim without it |
| Production posture | Phase G probe: `curl /api/health` (live modes, `mockConnectorWritesAllowed=false`, `liveModeViolations`) |

Orphan found in Phase B: no single deterministic test chained the whole loop.
Filled in Phase C by `src/lib/loop-completeness.test.ts` (note → classification
→ trigger match → run → draft → approval → connector result → outcome memory →
next run reads priorOutcomes → analytics report) and
`src/app/api/notes/route.test.ts` (real note route → field evidence → loop
match → draft → approval → local-only mock connector → outcome memory). Phase C
exit criterion requires both focused tests plus the high-risk gate to pass.

## Phase D–G status (2026-07-04, commit f5cda738)

- **D (connector/live proof):** production policy verified live —
  `/api/health` → `ok:true`, `mockConnectorWritesAllowed:false`,
  `liveModeViolations:[]`. Setup-required honesty visible in Connector Hub
  (exact env keys per connector, "production mock writes are disabled").
  **Live Gmail draft = HUMAN BOUNDARY** (needs the user's signed-in Google
  session); local fail-closed proof exists (`live-only.test.ts`,
  approve-route setup-failure test).
- **E (provider depth):** readiness/real/mock provider suites green; honest
  not-configured D-cards asserted by tests and the two eval invariants.
- **F (operator UX QA):** Vercel preview of f5cda738 QA'd via browser at
  1512px and 1232px: map+launchpad, Pipeline (honest zeros), Action Inbox
  (honest empty state), Loop Studio (4 seeded loops, schedule badges, 0-stats),
  Connector Hub (all setup-required) — no overlap, no dead workflow, no
  misleading status. **Remaining:** true mobile-width (~390px) pass — local
  dev server + Playwright were environment-blocked (8GB machine, see
  playbook gotcha); Chrome window would not shrink below 1232px.
- **G (production-safe verification):** prod health probed; preview deployment
  READY = the `next build` proof (local build intentionally skipped per
  gotcha). GitHub checks on f5cda738: `agent proof` ✅, CodeQL ✅, Vercel ✅.
- **Not done, human-gated:** merge/PR (PR needs the P1 Playwright video —
  same environment blocker), live Gmail draft proof, mobile-width QA.

## Phase E UX proof update (2026-07-12)

- Connector Hub now tells operators that approvals needing an unconnected
  provider stop as setup-required until OAuth, credentials, or webhook URL setup
  is complete.
- `src/components/ConnectorHub.test.ts` covers OAuth/API-key/connected copy.
- Rendered QA covered the Connector Hub at desktop and 390px mobile widths:
  setup-required copy was visible on all six action connector cards and console
  errors/warnings were empty. The Browser DOM snapshot API failed in this
  environment, so validation used in-app Browser screenshot/evaluate checks; a
  standalone Playwright fallback was unavailable because the local browser
  binary is not installed.
