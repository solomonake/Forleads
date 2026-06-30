# Plan: WS-J · Flip real send live (per-channel, per-tenant)

> Model-agnostic. The seams are in place (`Connector` interface, idempotency
> ledger, `/api/approve` human gate, `connector_credential` table). The new
> code is a tenant×channel feature flag + an `auth/gmail.send` scope path +
> a Twilio `sendSms` call that the approve route already wires through. No
> auto-send: a human still approves every artifact.

**Goal:** When a per-tenant per-channel `send_live` flag is ON, hitting
`POST /api/approve` writes a REAL Gmail SENT message (not just a draft) for
the `email` channel, and a REAL Twilio SMS for the `sms` channel. Default is
OFF for every tenant. The artifact ledger records `mode:"live"` +
`channel:"sent"` (vs `"draft"`); idempotency dedupes retries.

**Why / value:** UC-1, UC-4, UC-8, UC-10, UC-11 all converge on a single
truth — agents need *outgoing communication*, not a draft they have to copy
into Gmail. The Friday client (`memory/friday-client-launch.md`) cannot run
a real cadence on drafts. But flipping the whole product to "send" is
binary and dangerous (this is the only `critical`-tier connector path in
the catalog). A per-tenant, per-channel flag lets us go live with ONE
trusted tenant on ONE channel, watch outcomes for a day, then expand.

**User / job:** A trusted agent on the prod tenant who has authenticated
Google + Twilio, has reviewed and approved an artifact in the queue, and
wants the message to actually reach the recipient — without leaving the app.

**Pain evidence:**
- `docs/Forleads_UserCases_v1.md:7-23` (UC-1) — the canonical loop ends with
  "drafted follow-up"; in production the agent then has to context-switch
  to Gmail, hit Send, and come back. That's the friction the product
  promised to remove.
- `memory/friday-client-launch.md` — 2026-06-25 cadence demo lands flat if
  every "sent" message is still a draft the agent has to mail manually.
- `memory/prod-stance-no-mockups.md` — "drafts only" in prod is itself a
  half-mock; honest behavior is either *send* or *clearly mark as draft and
  open Gmail*. Right now we silently leave a draft. That's a P1 violation.
- Playbook line 42 — we already hardened against silent mock writes in
  prod; this is the inverse risk (silent fail-open on `send`) and has to
  inherit the same fail-closed discipline.

**Current → desired behavior:**
- *Before:* `/api/approve` always calls `GmailDraftConnector.createDraft`
  (`src/lib/connectors/gmail.ts:29`) → Gmail `drafts.create` → artifact is
  a draft in the user's Drafts folder. SMS approve calls
  `TwilioConnector.sendSms` (`src/lib/connectors/twilio.ts:30`) which is
  *already a live send* when creds exist — but there is no kill-switch and
  no per-tenant gating, which is itself a bug.
- *After:* A per-tenant row (`tenant_send_flag`) with `(agent_id, channel,
  enabled, enabled_by, enabled_at, reason)`. Approve route reads the flag.
  Email: if `enabled=true` and a valid `gmail.send` token exists, call
  `gmail.send` (POST `users/me/messages/send`); otherwise fall back to the
  current draft path AND surface a `mode:"draft"` reason. SMS: gated by
  the same flag; if `enabled=false`, the approve route refuses with a
  `setup required` 422 (does NOT silently send). Toggling the flag is a
  separate `/api/admin/send-flag` route, gated by an operator role +
  explicit confirmation string + writes to `domain_event` for audit.

**Non-goals:**
- A UI for end-agents to toggle the flag themselves. v1 is admin-only via
  the API + Supabase SQL, with audit. End-user UI is a follow-up.
- Bulk back-fill of past drafts → sends. The flag is forward-only.
- Inbox reading or thread fetching. Scope stays minimal: `gmail.send`
  on top of existing `gmail.compose`. NO `gmail.modify`, NO
  `gmail.readonly`.
- Outlook/Microsoft live send (still `MockConnector` —
  `src/lib/connectors/index.ts:36`). Tracked separately.
- Auto-send (no human in the loop). HARD invariant.

**Risk tier:** **critical**. This is the first prod path that writes
externally-visible messages to a recipient on the agent's behalf. Per
AGENTS.md §risk tiers: "auto-send, credentials, production writes" are
critical. Requires coverage, build, adversarial tests, rollback notes,
end-to-end proof, security review, and explicit human approval before
the flag is flipped for any real tenant.

**Context links:**
- `docs/Forleads_UserCases_v1.md:7-23` (UC-1), `:25-47` (UC-4), `:49-59`
  (UC-8), `:61-66` (UC-10), `:67-72` (UC-11).
- `docs/Forleads_Vision_v1.md` — north star + month-1 promise.
- `.agent/playbook.md` line 42 (mock-write fail-closed); line 47 (server-
  derived tenant id); line 25 (live seam + total fallback); line 21
  (`get_advisors` after every security boundary change).
- `src/lib/connectors/gmail.ts:1-182` — current Gmail draft connector.
- `src/lib/connectors/twilio.ts:1-122` — current Twilio live-send path
  (already sends when creds present — needs gate).
- `src/lib/connectors/index.ts:30-93` — connector factory; the seam for
  swapping `GmailDraftConnector` for a `GmailSendConnector`.
- `src/lib/connectors/types.ts:42-62` — `Connector` interface; ADD an
  optional `sendEmail()` capability alongside `createDraft()`.
- `src/lib/connectors/idempotency.ts` — already enforces dedupe per
  `meta.idempotencyKey`. Reuse for sends.
- `src/app/api/approve/route.ts:1-69` — the human gate; the routing
  decision (draft vs send) lives here, NOT inside the connector.
- `src/lib/pipeline.ts` — `approveArtifact()` already accepts options;
  extend with a resolved `sendLive: { email: bool, sms: bool }`.
- `src/lib/auth/google.ts:19` — scope list; add `gmail.send`.
- `src/lib/core/config.ts:63-66` — `GOOGLE_SCOPES` default; add `gmail.send`.
- `src/lib/auth/credentials.ts` — credential store; needs to mark which
  scopes the stored token actually covers (so an old `gmail.compose`-only
  token forces re-auth before we attempt `send`).
- WS-D handoff (`.agent/plans/ws-d.md`) — provides the production UAT
  surface (real tenant, real onboarding) that this packet needs before
  the flag is flipped.

**Seams & exact files:**

*New files (verified missing via `ls .agent/plans/` and `src/lib/connectors/`):*
- `src/lib/connectors/gmail-send.ts` — `GmailSendConnector` implementing
  the same `Connector` interface; `createDraft()` still works (delegates
  to the draft path so the draft-fallback is one class), but a new
  `sendEmail(payload, meta)` calls `POST users/me/messages/send`. Mode is
  `"live"` only when scope coverage includes `gmail.send`; otherwise
  `mode:"mock"` + `ok:false` + `error:"send scope required — reconnect Google"`.
- `src/lib/connectors/send-flag.ts` — pure helper:
  `isSendLive(agentId, channel, repo)` returns `boolean`. Hits the repo,
  caches per-request via React `cache()`. No env-var override in prod (to
  avoid a "global flip" footgun).
- `src/lib/connectors/send-flag.test.ts` — tenant isolation (agent A flag
  doesn't leak to agent B), default off, channel scoping (email on does
  not enable sms).
- `src/lib/connectors/gmail-send.test.ts` — happy send, missing-scope
  fallback to draft, 4xx/5xx error path, idempotency dedupe on retry,
  unauthorized → ok:false (never throws).
- `src/app/api/admin/send-flag/route.ts` — POST `{agentId, channel,
  enabled, reason}`. Requires (a) operator role from session (NEW —
  `session.role === "operator"`), (b) `confirm === "I UNDERSTAND THIS
  WILL SEND REAL MESSAGES"`. Writes the flag row and a `domain_event`
  with `kind:"send_flag.changed"`. NEVER reads `agentId` from query/body
  *for authorization* — the operator is identified by session, and the
  body's `agentId` is the *target* tenant.
- `src/app/api/admin/send-flag/route.test.ts` — non-operator → 403; wrong
  confirm string → 422; happy → 200 + ledger row + domain event.
- `supabase/migrations/0012_tenant_send_flag.sql` — table `tenant_send_flag
  (agent_id uuid, channel text check in ('email','sms'), enabled bool not
  null default false, enabled_by uuid, enabled_at timestamptz, reason text,
  primary key (agent_id, channel))` + RLS scoped to `agent_id` for SELECT
  (a tenant can read its own flag); INSERT/UPDATE bypassed only via
  service role. `domain_event` row written via `fl_log_event` RPC.
- `supabase/migrations/0013_session_role.sql` — `agent.role text default
  'agent' check in ('agent','operator')`.
- `docs/runbooks/flip-send-live.md` — operator runbook: pre-flight
  checklist (creds present, OAuth scopes include `gmail.send`, UAT pass,
  rollback path), the exact `curl` to flip, and the audit log query.

*Edited files (verified present via `ls`):*
- `src/lib/connectors/types.ts:42-62` — extend `Connector` with optional
  `sendEmail?(payload: EmailPayload, meta: ConnectorWriteMeta):
  Promise<ConnectorResult>`. Optional so existing connectors stay valid.
- `src/lib/connectors/index.ts:30-93` — `connectorForAction("email", opts)`
  returns `GmailSendConnector` (which itself decides draft vs send based
  on `opts.sendLive`); `connectorForAction("sms", ...)` unchanged (Twilio
  is already a send connector) but now gated by `opts.sendLive.sms`.
  Add `ConnectorRouteOpts.sendLive?: { email?: bool; sms?: bool }`.
- `src/lib/connectors/twilio.ts:30-77` — refuse send when caller did NOT
  pass `sendLive=true`. Implement as a constructor flag
  `sendLiveAllowed: boolean` defaulted to `false`; current happy path
  becomes `ok:false, error:"send not enabled for this tenant"` unless the
  factory sets it.
- `src/lib/connectors/gmail.ts:29-100` — no behavior change to the draft
  path; export a shared `createDraftInternal()` so `GmailSendConnector`
  can reuse it on the fallback branch (avoid duplication; playbook
  "reuse pattern").
- `src/app/api/approve/route.ts:14-69` — after deriving `agentId`, call
  `isSendLive(agentId, "email")` and `isSendLive(agentId, "sms")` from
  the repo; pass `{ sendLive: { email, sms } }` into `approveArtifact`.
- `src/lib/pipeline.ts` (`approveArtifact`) — thread `sendLive` through
  to `connectorForAction(action.type, { googleAccessToken, sendLive })`.
- `src/lib/auth/google.ts:19` — add
  `"https://www.googleapis.com/auth/gmail.send"` to `GOOGLE_SCOPES`.
- `src/lib/core/config.ts:63-66` — same addition to the default
  `GOOGLE_SCOPES` string.
- `src/lib/auth/credentials.ts` — persist `scope` (already done per the
  credentials test) and expose `tokenCoversScope(cred, "gmail.send")`.
- `src/lib/db/repository.ts` — extend `Repo` with
  `getSendFlag(agentId, channel)` and `setSendFlag(agentId, channel,
  enabled, {by, reason})`. Implement in both `mock-repo` and
  `supabase-repo.ts`.
- `src/components/ConnectorHub.tsx:84` — when `gmail.send` is missing
  from the stored scope, surface "Reconnect Google for live send"
  banner with `accountability-show-failures` honesty. Do NOT silently
  degrade.

**Steps:**
1. Migration `0012_tenant_send_flag.sql` + `0013_session_role.sql`.
   Apply, run Supabase MCP `get_advisors`, fix any new findings (playbook
   line 21). Round-trip the flag via `execute_sql`.
2. Extend `Repo` interface + both adapters with `getSendFlag` /
   `setSendFlag`. Write adapter tests against the in-memory repo first;
   then a thin Supabase adapter test (single round-trip — the larger
   suite stays in-memory per playbook line 50).
3. Add `gmail.send` to the scope list (`google.ts:19` +
   `config.ts:65`). Update `credentials.ts` to expose
   `tokenCoversScope`. Update `ConnectorHub` banner.
4. Build `src/lib/connectors/gmail-send.ts` + tests. `createDraft()`
   delegates to a shared internal. `sendEmail()` calls
   `users/me/messages/send`; fail-closed when the scope is missing.
   Idempotency via existing `once(key, ...)`. Mode label is `"live"`
   only when actually sending.
5. Update `Connector` interface (`types.ts:42-62`) — optional
   `sendEmail`. Update `GmailDraftConnector` to NOT implement
   `sendEmail` (so the factory must use `GmailSendConnector` when send
   is on).
6. Update `connectorForAction()` + the new `ConnectorRouteOpts.sendLive`.
   For SMS, refactor `TwilioConnector` to require the explicit
   `sendLiveAllowed` constructor flag and have `sendSms()` return
   `ok:false, error:"send not enabled for this tenant"` when it's
   `false` AND mode is `"live"`. Mock path is unchanged.
7. Wire `/api/approve` to read the flag and pass it into the pipeline.
   Cache the flag fetch per-request via React `cache()`. Return a richer
   response `{ mode: "live"|"draft", channel: "sent"|"draft", reason? }`
   so the UI can show "Sent to X" vs "Draft created in Gmail".
8. Build `/api/admin/send-flag` route + tests. Operator-only. Writes a
   `domain_event` per change. NO end-user UI in v1.
9. Author `docs/runbooks/flip-send-live.md` — the operator can flip the
   flag without reading source code.
10. Verification: `npm run typecheck && npm run lint && npm test`. Then
    `npm run agent:check -- --risk=critical` (which adds adversarial
    tests, build, rollback notes). Then a UAT against a real Google
    account on a non-prod tenant: approve an artifact, confirm the SENT
    folder has the message, then approve a retry and confirm dedupe.
    Repeat for SMS using a Twilio test number sending to the operator's
    own phone. Playwright video of the end-to-end flow attached to PR
    per `memory/video-in-pr-required.md`.

**Acceptance scenarios:**
- *Happy email send:* flag on, scope covers `gmail.send`, valid token →
  message appears in recipient's inbox, response is `{ok:true,
  mode:"live", channel:"sent", externalId, url}`; artifact ledger
  records same.
- *Happy SMS send:* flag on, Twilio creds present → SMS delivered;
  response `{ok:true, mode:"live", channel:"sent"}`.
- *Flag off (default):* email path silently falls back to draft;
  response `{ok:true, mode:"live", channel:"draft", reason:"send_flag
  not enabled"}`. SMS path returns `{ok:false, error:"send not enabled
  for this tenant"}` with HTTP 422 (NOT a silent success — SMS has no
  draft equivalent so we fail closed).
- *Stale scope (token only covers `gmail.compose`):* refuse to attempt
  `send`; fall back to draft AND set `ConnectorHub` banner to
  "Reconnect Google for live send"; honest failure surfaced to the user.
- *Cross-tenant attempt:* operator on tenant A POSTs `/api/admin/send-flag`
  with `agentId=B` → 403 unless `session.role==="operator"`; even
  operator role cannot bypass the explicit confirm string.
- *Retry idempotency:* approving the same artifact twice never sends
  twice. The second call returns `{deduped:true, externalId:<same>}`.
- *Provider 5xx:* Gmail/Twilio returns 500 → `ok:false`, no ledger
  poisoning, no silent success; retry-safe via idempotency.
- *Compliance-blocked:* still 422 BEFORE any send call. Fail-closed
  invariant remains.
- *Tenant isolation:* flag for tenant A cannot be read or set by tenant
  B (RLS-enforced for SELECT; service-role-only INSERT/UPDATE).

**Break plan / adversarial:**
- Forged session with `role:"operator"` for a non-operator agent → the
  session is server-signed; flipping `role` in the cookie fails
  `unsealValue`. Re-derive role from `agent.role` server-side, NOT from
  the cookie payload. (Tracked under open decisions — see below.)
- Twilio number lacks consent / is on the STOP list → respect Twilio's
  built-in opt-out; never override. Adversarial test: send to a number
  that previously STOP'd → Twilio returns 21610; surface as `ok:false`.
- Gmail token revoked between approve and send → `401`; treat as
  scope-missing path, fall back to draft, force re-auth banner.
- Race: flag flipped from `true` to `false` between read and send —
  acceptable to honor the read value; the `domain_event` row gives the
  audit trail.
- Idempotency ledger eviction (in-memory restart) → the connector also
  receives an idempotency key derived from `(artifactId, revision,
  channel)`; even after eviction, Gmail and Twilio both dedupe at their
  side on `messages.send` if the same MIME id is reused — verify with
  the live UAT before flip.
- Adversarial payload: 100-char "Subject" with control chars; emoji in
  body; multi-recipient `to:` — verify `buildGmailRaw` already escapes
  headers correctly (`mime.ts:1`); add a fuzz test if not.

**Verification evidence:**
- `npm run typecheck && npm run lint && npm test` → green.
- `npm run agent:check -- --risk=critical` → green (includes
  adversarial pass + rollback notes).
- Supabase MCP: `execute_sql "select * from tenant_send_flag where
  agent_id='<uat-agent>'"` round-trips after the admin route POST.
- Supabase MCP: `get_advisors` clean after both migrations.
- Live UAT log saved to `.agent/handoffs/ws-j-uat.md` with: Gmail
  message id, Gmail web URL of the sent message, Twilio message sid,
  Twilio dashboard URL, idempotency dedupe screenshot.
- Playwright video on PR top fold (`memory/video-in-pr-required.md`).
- 3–6 specific PR feedback questions posted per
  `memory/feedback-before-merge.md`; threads resolved before merge.

**Rollback plan:**
- *Code-level:* the connector factory still constructs
  `GmailDraftConnector` when `opts.sendLive.email !== true`. Reverting
  is a one-line change in `connectorForAction()` to hard-code
  `sendLive.email=false` and `sendLive.sms=false`. SMS will then 422
  on every approve — operator-visible, not silent.
- *Data-level:* `UPDATE tenant_send_flag SET enabled=false WHERE
  channel IN ('email','sms');` via Supabase SQL editor (service role).
  Takes effect on the next approve; no in-flight send is interrupted
  (this is acceptable — sends are single API calls, not long-running).
- *Scope-level:* if a stored Google token must be invalidated, follow
  `playbook.md` "Per-credential rotation" — `UPDATE
  connector_credential SET revoked_at = now()` for the impacted
  `agent_id`. The user will be redirected through `/api/auth/login`.
- *Total kill-switch:* set env `FORLEADS_DISABLE_LIVE_SEND=1` (NEW —
  read at the top of `connectorForAction()` and forces sendLive off).
  Trip via `vercel env add ... production` and re-deploy. 5-min RTO.
- *Audit:* every flag flip is in `domain_event` (kind
  `send_flag.changed`) with `enabled_by` + `reason`; can be replayed
  to reconstruct who turned what on/off.

**Dependencies:**
- **WS-D** (`/.agent/plans/ws-d.md`) — provides the production UAT
  surface (the Friday tenant, real Google OAuth, a non-mock onboarding
  flow with at least one real lead). Without WS-D, there's no honest
  way to UAT a live send — we'd be sending to seeds. WS-D must:
  (a) produce at least one real tenant with `agent.onboarded_at` set,
  (b) have a real Google credential in `connector_credential` with
  refresh token, (c) have at least one human-reviewable lead surface in
  the queue.
- **WS-M** (Real-user production hardening, see task list) — must
  provide the rate-limit envelope (`memory/prod-hardening.md` axis
  rate-limit:B) for `/api/admin/send-flag` (low budget — 5
  req/operator/hour) and for any auto-replay path that funnels into
  approve. WS-J must NOT ship before WS-M's capacity envelope is at
  least at the current "B" rating for the approve route specifically.

**Estimated hours:** 14h end-to-end for one engineer at solo-founder
pace (`memory/solo-builder-speed-mode.md`):
- migrations + repo: 1.5h
- scope + credentials: 1.0h
- GmailSendConnector + tests: 3.0h
- Twilio gating + tests: 1.5h
- admin route + audit: 2.0h
- approve route wiring + pipeline thread-through: 1.5h
- runbook: 0.5h
- adversarial tests + UAT loop (Gmail + Twilio): 2.5h
- PR + video + feedback round-trip: 0.5h

**Human-in-the-loop:**
- Operator role assignment for the human flipping flags: a one-shot
  SQL `UPDATE agent SET role='operator' WHERE id='<your-agent-id>'`
  via Supabase service role. Documented in the runbook.
- Twilio account: must be live (not trial) for inbound to non-verified
  numbers; trial is fine for UAT to a verified operator phone.
- Google: re-consent for the new `gmail.send` scope. Existing tokens
  cover only `gmail.compose`; users will be prompted on next login.
- Before flipping for any real recipient: explicit human approval per
  `AGENTS.md` ("Merge, deploy, spend, production mutation, and
  external communication remain human-approved").

**Open decisions:** (need human input — become AskUserQuestion items)
1. Should `session.role` be re-derived server-side from `agent.role` on
   every request (safer, costs one row read), or signed into the
   session cookie at login (faster, but a stale-role footgun if we
   ever revoke operator)? Default plan: re-derive on every request to
   `/api/admin/send-flag`; sign into cookie only the *agentId*.
   **Need confirmation** because it touches `auth/agent.ts` patterns.
2. For SMS when the flag is off, should the approve route 422 (fail
   closed, as proposed) or silently mark the artifact as "would-send"
   (a dry-run mode for previewing copy)? Dry-run is friendlier but
   risks confusing operators about whether anything was sent. Default
   plan: 422 fail-closed for v1; revisit after UAT.
3. The first tenant to enable `email.send`: is it the Friday client
   (`memory/friday-client-launch.md`) or the operator's own tenant?
   The operator-tenant-first path lets us see "real send" behavior
   without putting the client's reputation on the line for the first
   N sends. Default plan: operator first, then Friday client.
4. Sender identity for `From:`: today `buildGmailRaw` uses the
   payload's `from`. For a real send via the user's Google account,
   Gmail will overwrite `From:` to the authenticated user anyway —
   should we strip the `from` field upstream to avoid confusion in
   logs? Default plan: strip in `GmailSendConnector` only.
