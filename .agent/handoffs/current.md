# Current agent checkpoint

Generated: 2026-06-25T23:47:03.666Z

## State
- Branch: `codex/operator-loop-checkpoint`
- Commit: `063a046edcff`
- Worktree: dirty
- Changed files:
  - M  .agent/AGENT_OS.md
  - D  .agent/CHECKPOINT.json
  - D  .agent/SCORECARD.json
  - D  .agent/SESSION_HANDOFF.md
  - A  .agent/decisions.md
  - A  .agent/evals/corpus.v1.json
  - A  .agent/handoffs/2026-06-23-durable-persistence.md
  - A  .agent/handoffs/current.md
  - A  .agent/knowledge/catalog.json
  - A  .agent/metrics/README.md
  - A  .agent/metrics/runs.jsonl
  - A  .agent/metrics/schema.v1.json
  - A  .agent/notes/learnings-session-2026-06-25-night.md
  - M  .agent/onboarding-notes.md
  - M  .agent/plans/TEMPLATE.md
  - A  .agent/plans/agent-continuity-metrics.md
  - A  .agent/plans/fix-tenant-seed-ids.md
  - A  .agent/plans/live-only-production.md
  - M  .agent/playbook.md
  - A  .agent/product-engineering-os.json
  - D  .agent/scorecard.config.json
  - D  .agent/session-state.json
  - A  .agent/stress/baseline.json
  - M  .agent/templates/handoff.md
  - M  .env.example
  - M  .github/pull_request_template.md
  - M  .github/workflows/ci.yml
  - A  .github/workflows/knowledge-audit.yml
  - M  .github/workflows/pr-demo.yml
  - A  .nvmrc
  - A  AGENTS.md
  - M  CLAUDE.md
  - M  README.md
  - A  docs/Agentic_Systems_Evaluation_v1.md
  - M  docs/SETUP.md
  - M  package-lock.json
  - M  package.json
  - M  playwright.config.ts
  - M  playwright/demo.spec.ts
  - A  scripts/agent-check.mjs
  - A  scripts/agent-checkpoint.mjs
  - A  scripts/agent-context.mjs
  - A  scripts/agent-doctor.mjs
  - A  scripts/agent-eval.mjs
  - A  scripts/agent-handoff.mjs
  - A  scripts/agent-knowledge-audit.mjs
  - A  scripts/agent-lib.mjs
  - A  scripts/agent-scorecard.mjs
  - A  scripts/agent-stress.mjs
  - D  scripts/agent-system.mjs
  - M  scripts/smoke.sh
  - M  src/app/api/approve/route.ts
  - A  src/app/api/artifacts/[id]/route.ts
  - M  src/app/api/auth-guard.test.ts
  - M  src/app/api/auth/google/callback/route.ts
  - M  src/app/api/auth/google/login/route.ts
  - M  src/app/api/auth/session/route.ts
  - M  src/app/api/connectors/route.ts
  - M  src/app/api/connectors/zapier/inbound/route.ts
  - M  src/app/api/draft/route.ts
  - M  src/app/api/geocode/route.ts
  - A  src/app/api/health/route.test.ts
  - A  src/app/api/health/route.ts
  - M  src/app/api/inbox/route.ts
  - M  src/app/api/lead/route.ts
  - M  src/app/api/leads/route.ts
  - M  src/app/api/loops/route.ts
  - M  src/app/api/notes/route.ts
  - A  src/app/api/reject/route.ts
  - M  src/app/api/report/route.ts
  - M  src/app/api/trace/[id]/route.ts
  - M  src/app/globals.css
  - M  src/components/ActionInbox.tsx
  - M  src/components/AgentTraceDrawer.tsx
  - M  src/components/ConnectorHub.tsx
  - M  src/components/LoopStudio.tsx
  - M  src/components/MapWorkspace.tsx
  - M  src/components/ReviewTray.tsx
  - A  src/components/api.ts
  - A  src/components/ui.test.ts
  - M  src/components/ui.tsx
  - M  src/lib/agents/claude.ts
  - M  src/lib/agents/composer.ts
  - A  src/lib/agents/dispatcher.neighborhood.test.ts
  - M  src/lib/agents/dispatcher.ts
  - A  src/lib/agents/embedder.ts
  - A  src/lib/agents/memory.degrade.test.ts
  - A  src/lib/agents/memory.test.ts
  - A  src/lib/agents/memory.ts
  - A  src/lib/agents/outcome-emit.test.ts
  - A  src/lib/agents/outcome-v2.test.ts
  - A  src/lib/agents/outcome.test.ts
  - M  src/lib/agents/scouts.cache.test.ts
  - M  src/lib/agents/scouts.ts
  - M  src/lib/agents/trace.ts
  - A  src/lib/artifacts/revise.test.ts
  - A  src/lib/artifacts/revise.ts
  - M  src/lib/auth/agent.test.ts
  - M  src/lib/auth/agent.ts
  - A  src/lib/auth/credentials.test.ts
  - A  src/lib/auth/credentials.ts
  - M  src/lib/auth/session.ts
  - M  src/lib/connectors/calendar.ts
  - M  src/lib/connectors/followupboss.ts
  - M  src/lib/connectors/gmail.ts
  - M  src/lib/connectors/gohighlevel.ts
  - M  src/lib/connectors/index.ts
  - A  src/lib/connectors/live-only.test.ts
  - M  src/lib/connectors/mock.ts
  - M  src/lib/connectors/twilio.ts
  - M  src/lib/connectors/zapier.ts
  - M  src/lib/core/config.ts
  - M  src/lib/core/types.ts
  - M  src/lib/db/repository.ts
  - A  src/lib/db/seed-id.ts
  - A  src/lib/db/seed.test.ts
  - M  src/lib/db/seed.ts
  - A  src/lib/db/supabase-health.ts
  - A  src/lib/db/supabase-repo.test.ts
  - M  src/lib/db/supabase-repo.ts
  - A  src/lib/events.test.ts
  - A  src/lib/loops/analytics.test.ts
  - A  src/lib/loops/analytics.ts
  - M  src/lib/loops/definitions.ts
  - M  src/lib/loops/engine.test.ts
  - M  src/lib/loops/engine.ts
  - A  src/lib/pipeline.neighborhood.test.ts
  - A  src/lib/pipeline.recall.test.ts
  - A  src/lib/pipeline.recalled-hits.test.ts
  - M  src/lib/pipeline.ts
  - A  src/lib/providers/real.test.ts
  - M  src/lib/providers/real.ts
  - A  src/lib/scout-fanout.degrade.test.ts
  - M  src/lib/validation/index.ts
  - A  supabase/migrations/0005_memories.sql
  - A  supabase/migrations/0006_artifact_revisions.sql
  - A  supabase/migrations/0007_runtime_idempotency.sql
  - A  supabase/migrations/0008_connector_credentials.sql
  - A  supabase/migrations/0009_outcome_memory.sql
  - A  supabase/migrations/0010_neighborhood_memory.sql
  - M  vitest.config.ts

## Goal
Ship operator-flow UI and durable merge loop on current production main

## Completed
Merged current main locally; preserved live-only production safeguards; added operator launchpad and pipeline guidance; verified exact Clarksburg query returns real live results; passed high-risk gate and browser review

## Next exact action
Complete merge commit, push branch and main, verify Vercel deployment, then select the next product gap

## Blockers
none

## Authority
In-scope read, edit, test, branch, commit, push, and draft PR are allowed; secrets, spending, destructive actions, and external communication require the user.

## Verification proof
none

## Cold-start sequence
1. Read `AGENTS.md`, `.agent/AGENT_OS.md`, this checkpoint, and the linked plan.
2. Run `npm run agent:doctor`.
3. Verify the branch/commit and inspect only the changed or referenced files.
4. Re-run the cheapest proof for the risky seam before editing.
5. Continue from **Next exact action**; do not restart discovery unless the evidence is stale.
