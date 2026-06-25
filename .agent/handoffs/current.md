# Current agent checkpoint

Generated: 2026-06-25T14:56:39.848Z

## State
- Branch: `codex/finalize-agent-checkpoint`
- Commit: `73f23190cf4b`
- Worktree: clean
- Changed files:
  - none

## Goal
Replace remaining grade-D property, owner, market, and hazard gaps with licensed live providers without ever fabricating data

## Completed
PR #30 fixed tenant provisioning; PR #31 disabled production mock connector successes; PR #32 added cross-model checkpoints and scorecards; production core is healthy and address search is live

## Next exact action
User creates an ATTOM developer API key; next agent implements and verifies the ATTOM provider adapter, then adds the no-key FEMA NFHL risk adapter

## Blockers
ATTOM_API_KEY is not yet available; do not add or guess paid-provider data

## Authority
In-scope read, edit, test, branch, commit, push, and draft PR are allowed; secrets, spending, destructive actions, and external communication require the user.

## Verification proof
prod /api/lead POST 200 in 3049ms request 1a2c7948-3e01-4f71-9ae5-315bc086591a; prod /api/health 200 request 272d24a7-1334-47ae-859f-94757569b5b9 with mockConnectorWritesAllowed=false and zero live-mode violations

## Cold-start sequence
1. Read `AGENTS.md`, `.agent/AGENT_OS.md`, this checkpoint, and the linked plan.
2. Run `npm run agent:doctor`.
3. Verify the branch/commit and inspect only the changed or referenced files.
4. Re-run the cheapest proof for the risky seam before editing.
5. Continue from **Next exact action**; do not restart discovery unless the evidence is stale.
