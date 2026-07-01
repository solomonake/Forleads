# Plan: WS-M Phase 1b execution

> Execution supplement for `.agent/plans/ws-m.md`. Keeps this branch scoped to
> the accepted Phase 1b slice only.

**Goal:** Ship the Phase 1b hardening slice on an isolated branch with proof for
landing clarity, env-gated error capture, tenant quota, and a founder-readable
North Star endpoint.

**Why / value:** This turns the product from "signed-in operator tool" into a
clear front door with measurable production usage and bounded abuse, without
pulling in unrelated schema or dashboard work.

**User / job:** A cold visitor understands Forleads at `/`, signs in with
Google, lands in `/app`, and approved work becomes measurable for the founder.

**Pain evidence:** Root currently renders the app shell, 500s only hit stdout,
tenant quota is burst-only, and approved actions are not queryable as a metric.

**Current -> desired behavior:** Replace `/` with a server landing page, move
the app shell to `/app`, wire `withRoute()` to an env-gated Sentry adapter,
layer a daily quota over the existing limiter, emit/query approved-action
events, and trigger a flag-gated welcome draft on first Gmail link.

**Non-goals:** No role-schema change, no dashboard UI for North Star, no KV
quota backend, no live email auto-send, no production mutation.

**Risk tier:** medium. User-visible routing changes plus hot-path instrumentation
and quota logic, but all behind existing seams or env-gated defaults.

**Context links:**
- `AGENTS.md`
- `.agent/AGENT_OS.md`
- `.agent/handoffs/current.md`
- `.agent/plans/ws-m.md`
- `.agent/decisions/phase-0-resolutions.md`

**Seams & exact files:**
- routing: `src/app/page.tsx`, `src/app/app/page.tsx`, `src/components/AppShell.tsx`
- observability: `src/lib/observability/index.ts`, `src/lib/observability/sentry.ts`
- quota: `src/lib/ratelimit/index.ts`, `src/lib/ratelimit/quota.ts`
- north star: `src/lib/analytics/northstar.ts`, `src/app/api/metrics/northstar/route.ts`
- welcome: `src/lib/email/welcome.ts`, `src/app/api/auth/google/callback/route.ts`

**Steps:**
1. Move the current app shell behind `/app` with a server auth redirect.
2. Add a marketing root page that handles auth notices and a Google sign-in CTA.
3. Add env-gated Sentry reporting and wire it into `withRoute`.
4. Add daily quota support and apply it to the existing expensive routes.
5. Emit and expose North Star approval events.
6. Add a draft-backed welcome helper and trigger it idempotently on first link.
7. Add focused tests, then run typecheck, lint, test, and `agent:check`.

**Acceptance scenarios:** cold landing, signed-in redirect, quota 429,
founder-only metrics, Sentry no-op when unset, welcome send once.

**Break plan:** exhaust quota, force a thrown route with Sentry enabled,
re-run welcome twice, hit founder metrics as non-founder.

**Verification evidence:** targeted unit tests, full repo gates, and
`npm run agent:check -- --risk=medium`.

**Cost / context budget:** one worktree, no paid APIs required locally, narrow
context limited to packet-named files plus failing tests.

**Risks / gotchas:** keep fire-and-forget off the hot path, do not widen auth
scope, default quota open enough to avoid false lockout, and keep founder gating
env-based for this phase.

**Human-in-the-loop:** Sentry DSN and welcome-email enablement remain env flips.

**Done criteria:** landing path, error sink seam, quota seam, metrics endpoint,
welcome draft seam, tests green, medium gate recorded.
