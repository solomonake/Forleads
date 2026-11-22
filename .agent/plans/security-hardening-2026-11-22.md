# Plan: Security hardening round 1 (Nov 22 review)

> Model-agnostic. Everything a model needs is here.

**Goal:** Close the small, code-only gaps from the Nov 22 security review without changing production config, schema or connector behavior for correctly configured tenants.

**Why / value:** Forleads accepts any Google account. A stranger must never be able to log in with a non-session cookie, spend the operator's Twilio, GHL or Gmail, or spend paid Street View while signed out.

**User / job:** Solo, as operator, keeping a public sign-up product safe before real agents onboard.

**Pain evidence:** Code review of effb524: getSession accepts any value sealed with SESSION_SECRET (the OAuth state cookie is one, so a signed-out user can mint a session with no `sub`); connector factory falls back to operator env credentials for every tenant; MIME headers pass CR/LF; cron and Zapier secrets use `!==`; sent artifacts can be revised back to drafted; Street View proxy serves signed-out callers.

**Current → desired behavior:**
- getSession returns null unless the value has a non-empty `sub` and a `createdAt` within 30 days (not in the future).
- In production, GOOGLE_ACCESS_TOKEN, GHL_* and TWILIO_* env values are never used for tenant actions; local dev and tests unchanged.
- From, To and Subject are single-line before MIME assembly.
- Cron bearer and Zapier secret compare in constant time.
- Revising a `sent` artifact throws; approved-but-unsent revisions still invalidate approval as before.
- Production Street View requires a signed-in agent (401 otherwise).
- `poweredByHeader: false`; CI token is `contents: read`.

**Non-goals:** CSP enforcement, distributed rate limiting, separate credential encryption key, Zapier HMAC, Microsoft PKCE, Node 22 upgrade. Each is filed in Linear.

**Risk tier:** high (auth, connectors). No schema, secret or production config change.

**Seams & exact files:** src/lib/auth/session.ts, src/lib/connectors/index.ts, src/lib/connectors/mime.ts, src/lib/security/safe-equal.ts (new), src/app/api/cron/loops/route.ts, src/app/api/connectors/zapier/inbound/route.ts, src/lib/artifacts/revise.ts, src/app/api/imagery/google-street-view/route.ts, next.config.mjs, .github/workflows/ci.yml.

**Acceptance scenarios:** OAuth state cookie copied into fl_session is rejected; 31-day-old session rejected; production tenant SMS/email/CRM with operator env set and no tenant creds makes no network call and fails closed; CRLF subject yields 6 header lines; sent artifact revise throws and status stays sent.

**Break plan:** tests in session.test.ts, production-policy.test.ts, mime.test.ts, revise.test.ts, safe-equal.test.ts.

**Verification evidence:** CI on the draft PR (typecheck, lint, vitest, coverage, audit, build, smokes). The authoring container could not reach the npm registry, so local runs were not possible.

**Risks / gotchas:** Users signed in more than 30 days ago are signed out once (cookie maxAge was already 30 days, so this only affects resent cookies). Any operator relying on env GHL/Twilio in production for their own tenant must paste those credentials into Settings instead.

**Human-in-the-loop:** Merge and deploy are Solo's call.

**Done criteria:** CI green on the draft PR; Solo reviews the review page.

**Rollback:** revert the PR. No data or secret changes.
