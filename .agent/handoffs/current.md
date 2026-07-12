# Current agent checkpoint

Generated: 2026-07-12T05:30:35.046Z

## State
- Branch: `codex/connector-live-posture`
- Commit: `9cd0c81b8a76`
- Worktree: dirty
- Changed files:
  - M src/app/api/approve/route.test.ts
  -  M src/app/api/approve/route.ts
  -  M src/lib/agents/outcome.test.ts
  -  M src/lib/pipeline.ts
  - ?? .agent/plans/connector-live-posture.md

## Goal
Continue the production loop for live connector honesty and approval-gated external writes.

## Completed
- Added `.agent/plans/connector-live-posture.md`.
- Hardened `/api/approve` so stale Google refresh failures are passed as setup-required connector failures.
- Added `code: "connector_setup_required"` to 424 approval responses.
- Updated `approveArtifact()` so email/calendar artifacts remain drafted when Google credentials need reconnection and no fresh access token exists.
- Added route and pipeline tests for setup-required/stale-OAuth failures.

## Next exact action
Commit, push `codex/connector-live-posture`, open PR, watch checks, merge if green, then continue to the next production gap.

## Blockers
none

## Authority
In-scope read, edit, test, branch, commit, push, and draft PR are allowed; secrets, spending, destructive actions, and external communication require the user.

## Verification proof
- `npm run typecheck` passed.
- `npm run lint` passed.
- `./node_modules/.bin/vitest run src/app/api/approve/route.test.ts src/lib/agents/outcome.test.ts src/lib/connectors/live-only.test.ts --reporter=dot` passed: 3 files, 18 tests.
- `npm run agent:check -- --risk=high` passed: doctor, typecheck, lint, 57 test files / 264 passed / 10 skipped, eval 16/16, coverage, and build.
- Scorecard appended for `connector-live-posture` with 7/7 gates.

## Cold-start sequence
1. Read `AGENTS.md`, `.agent/AGENT_OS.md`, this checkpoint, and the linked plan.
2. Run `npm run agent:doctor`.
3. Verify the branch/commit and inspect only the changed or referenced files.
4. Re-run the cheapest proof for the risky seam before editing.
5. Continue from **Next exact action**; do not restart discovery unless the evidence is stale.
