# Plan: WS-M — Real-user production hardening

> Model-agnostic. Everything a model needs is here — don't rely on the model
> "being smart." If a step needs intelligence, specify it.

**Goal:** Promote the four cross-cutting production-readiness gaps that block a
*non-Solomon* user from landing on forleads.app, understanding what it is,
signing in, hitting it hard, and being observable when something breaks:
(1) Sentry-equivalent error reporting wired into the existing `withRoute`
boundary, (2) per-tenant quota gates layered on top of the existing IP+agent
rate limiter, (3) a real marketing landing page replacing the
authenticated-app `/` entry, (4) a product-analytics event for the North Star
("approved actions per active agent per week"), and (5) a first-touch
onboarding email template the connector flow can trigger on first Gmail link.

**Why / value:** Forleads has shipped 7+ live workstreams (props, risk,
caption, listing copy, comps, watchers, drive-by, FUB/GHL, real send) and is
launching to a paying client on 2026-06-25. Today the front door at `/`
mounts the authed app (`src/app/page.tsx:1-40`), there is no captured signal
for the one metric the Vision pegs as the North Star
(`docs/Forleads_Vision_v1.md:56-57`), per-tenant abuse (one customer torching
their own quota and starving everyone else) is invisible, and a 500 in
production surfaces only as a `console.error` JSON line in Vercel logs
(`src/lib/observability/index.ts:13-22`) — nobody is paged. That is the gap
between "useful tool I run for myself" and "product a stranger can pay for".

**User / job:** A licensed agent who heard about Forleads from a peer, lands
on `forleads.app`, decides in <10s whether to sign in, signs in with Google,
links Gmail, and starts approving drafts. The founder watches a dashboard for
*their* North Star number rising, and is paged within minutes when a route
crashes for any tenant. Cross-cutting — touches UC-1…UC-11.

**Pain evidence:**
- `src/app/page.tsx:1-90` — root URL renders the navrail + MapWorkspace; no
  marketing context, no "what is this", no sign-in CTA above the fold for a
  cold visitor.
- `src/lib/observability/index.ts:43-72` — `withRoute` logs a JSON line and
  returns 500, but there is no external sink. A 500 storm at 2am is invisible
  until the next human eyeballs Vercel logs.
- `src/lib/ratelimit/index.ts:14-60` — `InMemoryRateLimiter` keys on
  `ip+agentId` per warm instance. A single tenant can still hammer Overpass
  via N instances and there is no per-tenant *quota* (daily/monthly budget
  ceiling) distinct from per-window burst limit.
- No code emits a structured "action approved" analytics event today —
  `grep -rn "northstar\|approved_action" src/` is empty. The North Star is
  un-measurable in production.
- No `welcome` email template exists; first Gmail link
  (`src/app/api/auth/google/callback/route.ts`) drops the user back into the
  app silently.

**Current → desired behavior:**
- *Current:* `/` mounts the app; 500s log to stdout only; per-tenant burst
  limit but no daily quota; North Star is unmeasurable; new connector linkers
  get no email.
- *Desired:* `/` is a marketing landing page with "Sign in with Google" CTA
  and clear value prop; the authed app lives at `/app`. `withRoute` ships
  uncaught throws to Sentry (Sentry DSN env-flag-gated, falls back to
  stdout-only if absent). `InMemoryRateLimiter` is composed with a per-tenant
  daily-quota guard (`InMemoryQuotaGate`, same seam — KV-swappable later). A
  `northstar.action.approved` event fires from `/api/approve` and is queryable
  via a single `/api/metrics/northstar` JSON endpoint. First successful
  Gmail-callback for a new agent enqueues one welcome email via the user's
  own Gmail draft (idempotent, fail-closed: if it can't send it logs and
  moves on).

**Non-goals:**
- Replacing the in-memory ratelimit/quota with KV in *this* workstream (the
  seam is enough; KV drop-in is a follow-up).
- A full marketing site / docs hub — one landing page only.
- A real analytics dashboard UI — the `/api/metrics/northstar` JSON endpoint
  + the existing Weekly Report widget is enough for v1.
- Replacing Sentry with a custom error-tracker. Sentry SDK (self-hosted or
  hosted) is the default; if user prefers Axiom/Logflare/Highlight, the seam
  in `observability/index.ts` already isolates that choice — swap in a single
  function call.
- Email *deliverability* infra (DKIM/SPF for a forleads.app sender). The
  welcome email rides the *user's own Gmail* via the connector they just
  linked, so deliverability is theirs, not ours.

**Risk tier:** **medium**. Touches user-visible entry surface (marketing
page), adds a paid third-party (Sentry) but env-flag-gated with graceful
fallback, adds per-tenant quota that could lock out a real user if misconfigured
(must default OPEN with high ceiling), and writes one event per approval (hot
path — must be fire-and-forget). Not `high` because no auth/persistence/policy
changes; not `low` because it touches `/` and the approval hot path. Per AGENTS
§risk-tiers, run `npm run agent:check -- --risk=medium`.

**Context links:**
- `AGENTS.md` §Lifecycle, §Risk tiers, §Forleads invariants
- `docs/Forleads_Vision_v1.md` §6.2 (grounded moat), §8 (North Star)
- `docs/Forleads_UserCases_v1.md` (cross-cutting — UC-1…UC-11 all depend on
  the front door working)
- `.agent/playbook.md` §Seam pattern, §Live AI = one seam + total fallback
- `src/lib/observability/index.ts` — existing seam for error sink
- `src/lib/ratelimit/index.ts:21-26` — existing `RateLimiter` interface
- `src/app/api/approve/route.ts` — hot path the North Star event hooks into
- `src/app/api/auth/google/callback/route.ts:30-60` — connector-link surface
  where the welcome email triggers

**Seams & exact files:**

*New files (create):*
- `src/app/(marketing)/page.tsx` — the new landing page at `/`. Server
  component, no client JS beyond a sign-in form. Renders headline + 3 value
  bullets + "Sign in with Google" form posting to `/api/auth/login`.
- `src/app/(marketing)/layout.tsx` — marketing-only chrome (no navrail).
- `src/app/app/page.tsx` — the *current* `src/app/page.tsx` body moved here;
  authed users land at `/app`. Add a server-side redirect: unauth → `/`.
- `src/lib/observability/sentry.ts` — `reportError(err, ctx)` adapter.
  Reads `SENTRY_DSN` env. If unset → no-op (logged at `info`).
  If set → lazy-imports `@sentry/nextjs`, calls `Sentry.captureException`.
  One try/catch around the Sentry call itself so a Sentry outage cannot
  bubble up into a route response.
- `src/lib/ratelimit/quota.ts` — `QuotaGate` interface +
  `InMemoryQuotaGate` (per-tenant daily counter, fixed 24h window, sweep
  on `size > 5000`). Mirrors `RateLimiter` shape exactly. Composed in
  `withRateLimit` via a new optional `quota?: { tenantKey, limit }` arg.
- `src/lib/analytics/northstar.ts` — `emitApprovedAction(agentId, artifactId,
  loopId)` writes one row to `domain_event` (table already exists) with
  `kind = "northstar.action.approved"`. **Fire-and-forget** (`.catch(noop)`)
  per playbook gotcha (audit-unwrapped-awaits).
- `src/app/api/metrics/northstar/route.ts` — `GET` returns
  `{ weekStart, perAgent: [{agent_id, count}] }` from
  `domain_event WHERE kind='northstar.action.approved'`. Founder-only
  (auth gate: `session.sub === FOUNDER_SUB` env var). Rate-limited.
- `src/lib/email/welcome.ts` — `sendWelcomeEmail(agentId)`. Idempotent
  (checks `domain_event` for `welcome.sent` for this agent first), composes
  a 200-word "you're in, here's the 3-step first run" email via the user's
  own Gmail draft, marks `welcome.sent` on success. Fail-closed on missing
  creds (logs `welcome.skipped`, does not throw).
- `src/lib/email/welcome.test.ts` — unit test: idempotency (run twice → one
  send), fail-closed on missing creds.
- `src/lib/observability/sentry.test.ts` — unit test: DSN unset → no-op;
  DSN set + Sentry throws → does not bubble.
- `src/lib/ratelimit/quota.test.ts` — unit test: per-tenant counter,
  window reset, sweep behavior.
- `src/lib/analytics/northstar.test.ts` — unit test: emits one event per
  approve; never throws even when repo write fails.

*Existing files (edit):*
- `src/lib/observability/index.ts:43-72` (`withRoute`) — in the `catch`
  block, call `reportError(err, { name, requestId, ... })` BEFORE the
  existing log line. One-line wire-up.
- `src/lib/ratelimit/index.ts` — extend `withRateLimit` helper to accept
  an optional `quota: QuotaGate` and check it BEFORE the burst limit; if
  the quota gate fails, return 429 with `{ reason: "daily_quota" }` so
  the UI can render a useful message.
- `src/app/api/approve/route.ts` — after successful approve, call
  `emitApprovedAction(...)` (fire-and-forget).
- `src/app/api/auth/google/callback/route.ts:30-60` — after successful
  credential store, call `sendWelcomeEmail(agentId)` (fire-and-forget).
- `src/app/page.tsx` — DELETE (moved to `/app/page.tsx`).
- `src/app/layout.tsx` — verify `<Analytics />` still mounts on both
  marketing and app routes; if not, lift it to the root layout.
- `next.config.mjs` — if Sentry SDK used, add `withSentryConfig` wrapper
  (or skip if we go with the direct SDK import path, which is simpler).
- `package.json` — add `@sentry/nextjs` (optional dep; gated by env).
- `vercel.json` — verify no rewrites collide with `/app/*`.

**Steps:**
1. Move authed app from `/` to `/app` (rename `src/app/page.tsx` →
   `src/app/app/page.tsx`; add server redirect from `/app` to `/` for
   unauth). Verify all internal links/tests still resolve.
2. Build `src/app/(marketing)/page.tsx` (server component, sub-50-line,
   no client JS beyond the sign-in form). Match brand: black/cream from
   `globals.css`. Headline + 3 value bullets + "Sign in with Google".
   Include a `<noscript>` form too — landing pages must work offline-JS.
3. Add `src/lib/observability/sentry.ts` with the lazy-import pattern.
   Wire `reportError` into `withRoute`'s catch.
4. Add `src/lib/ratelimit/quota.ts`. Compose it into `withRateLimit`.
   Default daily ceiling = `RATE_LIMIT_DAILY_QUOTA` env (default: 5000,
   high enough to never trigger for a real user).
5. Add `src/lib/analytics/northstar.ts` + wire into `/api/approve`.
   Verify the event lands in `domain_event` via Supabase MCP `execute_sql`.
6. Add `src/app/api/metrics/northstar/route.ts`. Test with a `curl` from
   the founder session cookie.
7. Add `src/lib/email/welcome.ts` + wire into Google OAuth callback.
   Verify on a fresh test agent that exactly one welcome lands.
8. Run gates: `npm run typecheck && npm run lint && npm test`.
9. Run `npm run agent:check -- --risk=medium`. Capture evidence.
10. Playwright video: cold visit `/` → sign in → land at `/app` →
    approve a draft → see the event in `/api/metrics/northstar` →
    receive welcome email in test Gmail. Attach to PR body per
    [video-in-pr-required] memory rule.

**Acceptance scenarios:**
- *Happy:* Cold visitor lands at `/`, sees marketing page (1.5s LCP on
  3G), clicks "Sign in with Google", redirects to `/app`, approves a
  draft, the founder GETs `/api/metrics/northstar` and sees `count >= 1`
  for that agent.
- *Empty:* New user with zero approvals → `/api/metrics/northstar`
  returns `perAgent: []` (not 500).
- *Failure:* Sentry DSN set to a bogus URL → `withRoute` still returns
  500 to the caller with the existing `{error,requestId}` shape; the
  Sentry call swallows internally; one `warn` log line cites
  `sentry.unavailable`.
- *Failure:* Per-tenant daily quota exhausted → next request returns
  429 with `{ reason: "daily_quota" }`; founder dashboard can still
  serve metrics (separate route, not gated by tenant quota).
- *Recovery:* Welcome email send fails (Gmail revoked between callback
  and send) → `domain_event` records `welcome.skipped` with reason; the
  user's session is unaffected; next manual visit to `/app` works.
- *Responsive:* Marketing page renders correctly at 360px (mobile).

**Break plan:**
- Spam `/api/approve` from a single tenant 6000× — daily quota engages
  at 5000, subsequent calls 429 cleanly, app does not OOM.
- Set `SENTRY_DSN=https://bogus@bogus.invalid/1` — induce a 500 in any
  route; verify route returns 500 normally and one `warn` line logs
  `sentry.unavailable`.
- Sign in with a fresh Google account that has revoked Gmail scope
  between callback and welcome send — verify `welcome.skipped` event
  and no thrown exception.
- Disable JS in browser — verify marketing page sign-in form still
  POSTs to `/api/auth/login`.
- Run two parallel sign-ins for the same agent — verify exactly one
  welcome (idempotency check).

**Verification evidence:**
- `npm run typecheck && npm run lint && npm test` — all green.
- `curl -sI https://forleads.app/` returns 200 with marketing HTML (no
  `__next/data` for authed app shell).
- `curl -s https://forleads.app/api/metrics/northstar -b "session=..."` →
  founder JSON.
- Supabase MCP: `select kind, count(*) from domain_event where kind in
  ('northstar.action.approved','welcome.sent','welcome.skipped') group
  by kind;`
- Sentry dashboard shows a test exception captured (deliberately throw
  in a dev-only route, verify, then remove the throw).
- Playwright video attached to PR per [video-in-pr-required].

**Cost / context budget:**
- Sentry: free tier (5k events/month) covers v1 traffic.
- North Star events: one row per approve into existing `domain_event`
  table → negligible Supabase cost.
- Welcome email: rides user's Gmail quota → zero infra cost.
- Marketing page: static HTML → zero runtime cost.
- Daily quota gate: in-memory → zero infra cost.
- Token budget for THIS implementation: ~8 hours of agent time, no
  paid-call API costs beyond the smoke test.

**Risks / gotchas:**
- `.agent/playbook.md` "audit-unwrapped-awaits" — every new `await` in
  the hot path (`/api/approve` welcome trigger, north-star emit) MUST
  be fire-and-forget with `.catch(noop)`. Five silent-degradation bugs
  in one session prove this.
- `src/lib/playbook.md` Next 15 `cookies()` is async — the marketing
  page's auth check must `await getSession()`.
- Sentry's Next.js SDK wraps `next.config.mjs` — verify that wrap does
  not break the existing `transpilePackages` or other config.
- Per-tenant quota MUST default high (5000/day) — locking out a real
  customer on day one is worse than no quota at all.
- `(marketing)` route group + `/app` — verify Vercel doesn't cache the
  `/app` shell as static for unauth visitors.
- Welcome email idempotency check needs a UNIQUE on `(agent_id, kind)`
  for `welcome.sent` OR a transactional check — race condition between
  two parallel callbacks is real.

**Human-in-the-loop:**
- *Sentry DSN:* Solomon creates a free Sentry project at sentry.io,
  copies DSN, runs `vercel env add SENTRY_DSN production`. Set
  `vercel env ls production` to verify project target first
  (per memory rule: credentials-prompting-loop).
- *Founder sub:* `FOUNDER_SUB` env var = Solomon's Google `sub` claim.
  Pulled via signed-in session at `/api/auth/whoami` once, then set in
  Vercel envs.
- *Daily quota ceiling:* default 5000/day/tenant — confirm OK or
  override via `RATE_LIMIT_DAILY_QUOTA`.
- *Welcome copy:* needs founder approval before first send to a real
  user (200-word draft). Plan ships the template; the actual copy
  ships behind a `WELCOME_EMAIL_ENABLED=true` flag, default OFF until
  copy is signed off.

**Done criteria:**
- [ ] `/` serves marketing HTML (200, <50kb gzip, LCP <2s on 3G).
- [ ] `/app` requires auth; unauth → 302 to `/`.
- [ ] `SENTRY_DSN` set in prod; a deliberate test exception is captured
      and visible in Sentry within 60s.
- [ ] One `northstar.action.approved` event in `domain_event` per real
      `/api/approve` 200.
- [ ] `/api/metrics/northstar` returns founder-only JSON; non-founder
      session → 403.
- [ ] One welcome email lands per first successful Google OAuth
      callback per agent (idempotent — re-link → no second send).
- [ ] Per-tenant daily quota gate blocks at the configured ceiling and
      returns 429 with `{ reason: "daily_quota" }`.
- [ ] All gates pass: `npm run agent:check -- --risk=medium`.
- [ ] Playwright video in PR body, founder reviewer confirms cold-start
      flow works on their laptop without Solomon talking through it.
