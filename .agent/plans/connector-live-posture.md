# Plan: Connector Live Posture

**Goal:** Ensure approved outward actions fail closed with setup-required errors when live connector credentials are missing or stale.

**Why / value:** Real agents must not think a Gmail draft, CRM note, SMS, calendar hold, or webhook was created when Forleads only ran a mock path.

**User / job:** An agent reviews a drafted action, clicks approve, and needs either a real external artifact or a clear setup-required next step.

**Pain evidence:** The approval route still described token-refresh failure as falling back to mock, and connector failures are not richly classified for the UI.

**Current -> desired behavior:** Current production config disables mock connector writes, but route copy and setup errors are still generic. Desired behavior: token refresh failures are surfaced as setup-required, connector write failures carry a stable code, and traces/events record failed setup attempts without mutating the artifact.

**Non-goals:** Do not send real emails/SMS, change secrets, or deploy.

**Risk tier:** high, because this touches outward connector writes and human approval semantics.

**Context links:** `.agent/plans/product-completion-loop.md`, `src/app/api/approve/route.ts`, `src/lib/pipeline.ts`, `src/lib/connectors/live-only.test.ts`.

**Seams & exact files:** Approval route, pipeline connector result handling, connector result types/tests.

**Steps:**
1. Add a stable setup-required error code to connector write failures.
2. Return a 424 with actionable setup details when Google token refresh fails for the approval path.
3. Record connector failure traces/events without approving the artifact.
4. Add focused route/pipeline tests.
5. Run focused tests, typecheck, lint, then high-risk gate.

**Acceptance scenarios:** Happy: live connector success still approves/writes. Missing setup: missing/stale credentials return 424 and artifact remains drafted. Failure: live provider 5xx returns connector failure and artifact remains drafted. Recovery: retry after credentials uses the same revision-aware idempotency behavior.

**Break plan:** Missing token, refresh exception, provider 503, blocked artifact, stale revision, no SMS method, and duplicate approve retry.

**Verification evidence:** Focused approve/pipeline/connector tests plus `npm run agent:check -- --risk=high`.

**Human-in-the-loop:** Real external connector proof still needs the user's OAuth/API credentials and explicit approval.

**Done criteria:** No route or test presents mock connector success as production success, and setup-required failures are explicit and non-mutating.
