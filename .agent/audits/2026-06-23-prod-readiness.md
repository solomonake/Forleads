# Forleads — Production-Readiness Audit (2026-06-23)

Discipline: `scope-grill` GRILL. **No naked numbers** — every grade cites `file:line`
evidence and a stated *industrial threshold*; an ungrounded claim is labeled `D`.
Reviewer: prod-hardening pass on `main` @ `16143c1`.

Grade scale: **A** meets/exceeds an industrial SaaS bar · **B** close, one gap ·
**C** partial, real holes · **D** absent or actively unsafe.

## Scorecard

| # | Axis | Industrial threshold | Grade | Binding evidence |
|---|------|----------------------|:-----:|------------------|
| 1 | Authentication | Every agent-scoped route authenticates server-side | **D** | client-supplied `agentId` + `DEMO_AGENT_ID` fallback on every route |
| 2 | Authorization / tenant isolation | A request can only touch its own tenant | **D** | IDOR via `agentId`; all Google users collapse to one agent |
| 3 | RLS enforced at the real boundary | Where service-role bypasses RLS, the API must enforce | **D** | `SupabaseRepository` uses service-role key → RLS bypassed; API trusts client |
| 4 | Rate limiting / budget guards | Per-principal limits on expensive + external calls | **D** | no `middleware.ts`, no limiter, Claude/Overpass unmetered |
| 5 | Caching (cache-first by H3, §10) | Cache external/LLM results by spatial key + TTL | **D** | `h3Key` exists but unused as a cache; every lead re-hits Overpass live |
| 6 | Observability | Infra error tracking + structured request logs | **D** | no Sentry/logger in `package.json`; only domain traces |
| 7 | Input validation | Typed schema validation + body-size limit at the edge | **C** | manual presence checks only; no schema, no size cap |
| 8 | Reliability / idempotency | Idempotent writes, bounded work, graceful degrade | **B** | idempotency keys, scout budgets, Claude retry+fallback present |
| 9 | Secrets / security posture | Fail-closed secrets in prod; webhooks always verified | **C** | insecure `SESSION_SECRET` default runs in prod (warn-only); webhook secret optional |
| 10 | Tests | Security-critical paths covered; a capacity probe | **C** | 8 files / 43 tests; zero auth/authz route tests; no load test |
| 11 | Data / privacy | No protected attrs; durable store in prod | **B** | §13 honored; but persistence defaults to in-memory |

**Overall: D** — the product is a faithful demo, not multi-tenant-safe. One class of
defect (client-trusted `agentId`) makes axes 1–3 fail together and is the gating fix.

---

## Evidence detail

### 1–3 · Auth / Authz / RLS  — grade D (confidence A)
Every mutating and listing route derives the tenant from **client input** with a
shared demo fallback:

- `src/app/api/draft/route.ts:22` — `const agentId = body.agentId ?? DEMO_AGENT_ID;`
- `src/app/api/notes/route.ts:21` · `src/app/api/lead/route.ts:19` · `src/app/api/loops/route.ts:27`
- `src/app/api/leads/route.ts:7` · `src/app/api/connectors/route.ts:8` · `src/app/api/inbox/route.ts:8`
  · `src/app/api/report/route.ts:7` · `src/app/api/loops/route.ts:10` (query `agentId`)
- `src/app/api/connectors/zapier/inbound/route.ts:22` — webhook also trusts `body.agentId`

Consequences:
1. **Unauthenticated access** — no route except `auth/session` PATCH (`route.ts:34`)
   and partially `approve` requires a session. Anyone can POST a note/draft/lead.
2. **IDOR** — passing any `agentId` reads/writes that tenant's leads, drafts, inbox.
3. **No real tenancy** — `auth/google/callback/route.ts:42` upserts *every* signed-in
   user onto the single `DEMO_AGENT_ID`, while `auth/session` PATCH reads the agent by
   `s.sub` (`route.ts`: `repo.getAgent(s.sub)`). The provisioning model is already
   self-inconsistent — there is no per-user workspace.
4. **RLS is not the boundary** — `src/lib/db/index.ts` builds `SupabaseRepository` with
   `config.supabase.serviceKey` (service-role → bypasses RLS by design). So the DB
   migrations' RLS does **not** protect production; the API layer is the only gate, and
   it is open. Fixing RLS without fixing the API would be theater.

`getSession()` / `seal` / `unseal` (`src/lib/auth/session.ts`) and the Google OAuth flow
already exist and work — the gap is purely that **routes do not require them**. This makes
the fix high-ROI and low-blast-radius (no client sends `agentId` today —
`grep` of `src/app`/`src/components` finds none).

**Remediation (ROI #1):** a shared server helper `requireAgentId()` that reads the
session, 401s when absent, and returns a per-user agent id derived from `sub`
(stable uuid v5, reuse the `toUuid` pattern in `supabase-repo.ts:59`). Every route uses
it; client `agentId` is ignored entirely. Logged-out GETs may fall back to a read-only
demo agent; every mutation hard-requires a session.

### 4 · Rate limiting — grade D (confidence A)
No `middleware.ts` anywhere; `grep -rn rate src/lib src/app` → none. Claude calls
(`src/lib/agents/claude.ts`) and live Overpass (`src/lib/providers/real.ts:75`) are
unmetered. A single client can exhaust the Anthropic budget or trip OSM fair-use and get
the shared egress IP throttled for all users. **Threshold:** per-principal (IP + agent)
token-bucket on `/api/lead`, `/api/draft`, `/api/notes`. **ROI #2** (cheap, dependency-free,
caps cost + abuse).

### 5 · Caching by H3 — grade D (confidence A)
`h3Key(lng,lat)` exists (`src/lib/core/geo.ts:13`) but is referenced by **no** cache.
`scouts.ts` has zero cache lookups; `providers/real.ts` fetches Overpass on every call.
Constitution §10 ("cache-first by H3, keep cost ≈ $0") is currently **aspirational**.
**Threshold:** evidence/Overpass results cached by `h3Key` with a TTL; repeat opens of the
same block serve from cache. **ROI #3** (cuts external calls → directly raises capacity).

### 6 · Observability — grade D (confidence A)
No Sentry / structured logger in `package.json`. Domain-level Agent Traces exist
(`src/lib/agents/trace*`) but infra errors (a thrown route, a failed Overpass fetch) vanish
into Vercel's default logs with no alerting. **Threshold:** error capture + structured
request logging with a request id.

### 7 · Input validation — grade C (confidence B)
Routes hand-check presence (`draft/route.ts:18`, `notes/route.ts:18`, `lead/route.ts:17`)
and cast `body as {...}`. No schema validation, no enum/length checks on free text, no body
size cap → malformed/oversized payloads reach the pipeline. **Threshold:** schema-validated,
size-bounded input at the edge.

### 8 · Reliability / idempotency — grade B (confidence B)
Strong: connector writes idempotent (`src/lib/connectors/idempotency.ts`, FNV-1a
`idempotencyKey` in `core/ids.ts:13`); scouts bounded (`scouts.ts` `withBudget`); Claude
retry+timeout+total fallback (playbook + `claude.ts`). Gap: inbound webhook appends events
without an idempotency key, and there is no retry/queue for failed connector sends.

### 9 · Secrets / posture — grade C (confidence A)
- `src/lib/auth/session.ts` `key()` falls back to a hard-coded
  `"forleads-dev-insecure-session-secret-change-me"` and, in prod without `SESSION_SECRET`,
  only logs a one-time warning — it does **not fail closed**. An attacker who knows the
  default (it's in the repo) can forge sessions. **Must fail closed in prod.**
- `zapier/inbound/route.ts:10` only verifies the secret *if one is configured*
  (`if (config.zapier.webhookSecret && ...)`) → an unconfigured deploy accepts any inbound
  event. Good: secrets are server-only; session cookie is AES-256-GCM, httpOnly, secure.

### 10 · Tests — grade C (confidence A)
8 test files / 43 tests, unit + integration (evidence grading, compliance, loops, composer,
idempotency). **Zero** API-route auth/authz tests and no capacity/load probe — the exact
surfaces failing above are untested. **Threshold:** the security-critical path has tests.

### 11 · Data / privacy — grade B (confidence B)
§13 honored — no protected demographic attributes stored; values carry sources+confidence.
Risk: `config.persist` defaults to `"memory"` (`core/config.ts`), so a prod deploy without
`FORLEADS_PERSIST=supabase` silently evaporates all tenant data per invocation. This is a
deploy-config gate, not a code defect — flag for the env review (HUMAN-ONLY secret).

---

## Remediation order (highest ROI first)

1. **Auth + tenant isolation** (axes 1–3, D→A) — `requireAgentId()`, per-user agent,
   ignore client `agentId`, + auth route tests. *Lands first.*
2. **Rate limiting** (axis 4, D→B) — in-process token bucket per IP+agent on hot routes.
3. **Cache-first by H3** (axis 5, D→B) — TTL cache keyed by `h3Key` around Overpass/evidence.
4. **Observability** (axis 6, D→B) — structured request logging + error capture.
5. **Secrets fail-closed + webhook always-verify** (axis 9, C→A) — small, high-value.
6. **Input validation** (axis 7, C→B) — schema + size cap at the edge.

No gold-plating of axis 8/11 (already at/above bar). Each item ships via
branch → green CI + CodeQL → manual merge → prod-build review, per the constitution.

## Capacity envelope
Computed separately in `.agent/audits/2026-06-23-capacity-envelope.md` once caching lands
(the binding constraint is the uncached Overpass call; see axis 5).
