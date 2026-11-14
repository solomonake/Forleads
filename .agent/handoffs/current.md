# Current agent checkpoint

Generated: 2026-11-14T20:49:00.441Z

## State
- Branch: `codex/sol20-integration`
- Commit: `5c1fefc0e994`
- Worktree: dirty
- Changed files:
  - M .agent/handoffs/current.md
  - M  .eslintrc.json
  - M  .github/workflows/ci.yml
  - A  .github/workflows/post-deploy-smoke.yml
  - MM README.md
  - A  coverage-scope.d.mts
  - A  coverage-scope.mjs
  - M  docs/SETUP.md
  - M  next.config.mjs
  - M  package-lock.json
  - M  package.json
  - A  playwright.smoke.config.ts
  - AM playwright/a11y.smoke.ts
  - UU playwright/demo.spec.ts
  - A  playwright/map.smoke.ts
  - AM playwright/signed-out.smoke.ts
  - M  scripts/agent-doctor.mjs
  - A  scripts/coverage-summary.mjs
  - A  scripts/post-deploy-smoke.mjs
  - M  scripts/sync-maplibre-assets.mjs
  - A  security-headers.d.mts
  - A  security-headers.mjs
  - A  src/app/api/csp-report/route.test.ts
  - A  src/app/api/csp-report/route.ts
  - A  src/app/api/geocode/route.test.ts
  - M  src/app/api/geocode/route.ts
  - M  src/app/api/health/route.test.ts
  - M  src/app/api/health/route.ts
  -  M src/app/api/lead/route.ts
  - M  src/app/api/report/route.ts
  - A  src/app/api/trace/[id]/route.test.ts
  - M  src/app/api/trace/[id]/route.ts
  - A  src/app/error.tsx
  - MM src/app/globals.css
  - M  src/app/layout.tsx
  - UU src/app/page.tsx
  - M  src/app/privacy/page.tsx
  - M  src/components/AccountBar.tsx
  -  M src/components/FarmTable.tsx
  - M  src/components/GettingStarted.tsx
  - M  src/components/LoopStudio.tsx
  - M  src/components/MapWorkspace.tsx
  -  M src/components/Pipeline.tsx
  - MM src/components/WeeklyReport.tsx
  -  M src/components/api.ts
  -  M src/components/ui.test.ts
  - M  src/lib/agents/claude.ts
  - A  src/lib/core/capabilities.test.ts
  - A  src/lib/core/capabilities.ts
  - M  src/lib/core/config.ts
  - A  src/lib/coverage-scope.test.ts
  - A  src/lib/geocode/query.ts
  - A  src/lib/geocode/typeahead.test.ts
  - A  src/lib/geocode/typeahead.ts
  - A  src/lib/map/basemap.test.ts
  - A  src/lib/map/basemap.ts
  - A  src/lib/map/basemapErrors.test.ts
  - A  src/lib/map/basemapErrors.ts
  - A  src/lib/map/pendingAddress.test.ts
  - A  src/lib/map/pendingAddress.ts
  - M  src/lib/observability/index.ts
  - A  src/lib/observability/post-deploy-smoke.test.ts
  - A  src/lib/observability/report.test.ts
  - A  src/lib/observability/report.ts
  - M  src/lib/providers/catalog.live.test.ts
  - M  src/lib/providers/catalog.test.ts
  - M  src/lib/providers/catalog.ts
  - M  src/lib/providers/index.ts
  - M  src/lib/providers/mock.ts
  - M  src/lib/providers/readiness.ts
  - M  src/lib/providers/real.test.ts
  - M  src/lib/providers/real.ts
  - M  src/lib/providers/types.ts
  - A  src/lib/reports.test.ts
  - M  src/lib/reports.ts
  - A  src/lib/security-headers.test.ts
  - M  vitest.config.ts
  - ?? .agent/plans/sol20-integration.md
  - ?? playwright/farm.smoke.ts
  - ?? src/app/api/lead/import-account.test.ts
  - ?? src/lib/farm/import.test.ts
  - ?? src/lib/farm/import.ts

## Goal
SOL-20 integration merge and deploy

## Completed
CSV recovery and accessible navigation integrated; high-risk gates, audit, independent review, 19 production-build browser smokes and 5 demo flows passed

## Next exact action
Publish existing PR57, wait for exact-head CI, merge dependency stack in order, deploy and verify production

## Blockers
none

## Authority
Solo explicitly authorized integration ownership, merge and deploy in this chat

## Verification proof
450 passed, 17 skipped; doctor 83/83; eval 16/16; high-risk gates 7/7; audit 0 high/critical, 7 moderate; browser 19/19 and demo 5/5; independent review no blockers

## Cold-start sequence
1. Read `AGENTS.md`, `.agent/AGENT_OS.md`, this checkpoint, and the linked plan.
2. Run `npm run agent:doctor`.
3. Verify the branch/commit and inspect only the changed or referenced files.
4. Re-run the cheapest proof for the risky seam before editing.
5. Continue from **Next exact action**; do not restart discovery unless the evidence is stale.
