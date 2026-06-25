# Playbook — patterns & gotchas (read before acting)

## Reusable patterns (the moves that keep paying off)

- **Seam pattern.** Every external dependency (DB, AI, geocoder, property data,
  connectors) is a typed interface with a `mock` and a `real` adapter, chosen by
  one env var in `src/lib/core/config.ts`. "Going live" = setting a var, never a
  rewrite. When adding a new dependency, add the seam first.
- **No naked numbers.** Any value rendered carries `{sources[], confidence A–D}`.
  Providers return grade-D gaps instead of inventing facts. **Claude reasons;
  providers supply facts.** Never let the model be the source of a number.
- **Fix root cause, not symptom.** "Dummy data" wasn't fake content — it was an
  in-memory store resetting on serverless. The fix was persistence, not nicer
  fakes. Ask "why is it this way?" one level deeper than feels necessary.
- **Foundation before surface.** Persistence before UI polish. Beautiful UI on
  evaporating data is a demo that fails in front of a partner.
- **Verify the risky layer cheaply.** Probe the one thing most likely to break
  with a single call (a `curl`, a SQL round-trip) before trusting the whole app.
- **Security is found by tooling.** Run `get_advisors` after any change to a
  security boundary — it catches your *own* new holes (we revoked anon EXECUTE
  on functions we'd just added).
- **Live AI = one seam + total fallback.** All Claude calls go through the single
  `src/lib/agents/claude.ts` → `claudeJSON()` (server-only, low `max_tokens`,
  cached system block, 1 retry + timeout, typed `ClaudeError`). Each caller has a
  `*Best()` entry point (`composeBest`, `classifyNoteBest`) that runs live ONLY
  when `claudeLive()` and falls back to the deterministic path on ANY throw —
  a draft/classification is always produced, never a broken one. Claude reasons;
  facts still come only from grounded evidence; compliance lint runs AFTER.

## Gotchas table (failures already solved — do NOT rediscover)

| Symptom | Cause | Fix |
|---|---|---|
| `npm run build` hangs at 0% CPU locally | maplibre-gl + webpack optimize exhausts low RAM | Don't prod-build locally. Verify via `npm run dev` + `bash scripts/smoke.sh`. It builds fine on Vercel CI. |
| Long command stalls with no output | harness stdout back-pressure | Redirect to a file: `cmd > /tmp/out.log 2>&1`, then read the file. |
| Node `fetch()` reports `fetch failed` for a reachable production URL inside an agent sandbox | Node networking can be restricted differently from the approved system `curl` path | For verification probes, try `fetch` first and fall back to bounded `curl --fail --max-time`; still fail the gate if both paths fail. |
| `npm test` flaky / cross-test bleed | integration tests share in-memory singletons | vitest pinned to single fork in `vitest.config.ts`. Keep it. |
| `npm i` peer-dep errors (React 18) | `@vercel/analytics` / supabase want newer peers | `.npmrc` pins `legacy-peer-deps=true`. Install with `--legacy-peer-deps`. |
| **Live OSM Overpass returns `406 Not Acceptable`** | **request sent without a `User-Agent` (OSM fair-use)** | **`OSMPropertyProvider` now sends a descriptive UA header. Any new OSM/Nominatim/Overpass call MUST set `User-Agent`.** |
| Supabase insert fails: `id` is not a valid uuid | seed slugs (`loop-no-contact`, `conn-google`) vs uuid PK | `supabase-repo.ts` maps non-uuid slugs → stable uuid v5 via `toUuid()`. |
| Signed-in `/api/lead` fails with `duplicate key value violates unique constraint "connector_account_pkey"` during JIT workspace provisioning | loop/connector seed slugs were stable globally, so every tenant derived the same UUIDs; the in-memory connector map also keyed only by provider and hid the collision | Generate seeded row IDs with `workspaceSeedId(agent_id, slug)` for every non-demo tenant, preserve legacy demo slugs for compatibility, and key in-memory connector accounts by `agent_id:provider`. Regression-test at least two real tenants plus demo. |
| A production approval appears successful but no external draft/task/SMS exists | connector adapters treated missing credentials as a successful deterministic mock, which is useful locally but dishonest for a real client | Mock writes are local/test-only. Production factories pass `allowMockConnectorWrites=false`; missing credentials must return `ok:false`, show `setup required`, and leave the artifact unapproved. Keep the escape hatch off on main. |
| PostGIS geom can't be read/written over PostgREST | geography isn't inline-constructible via REST | Write via `fl_upsert_lead_surface` RPC; read via generated `lng`/`lat` columns (migration 0003). |
| Supabase advisor: "anon can execute SECURITY DEFINER fn" | new `SECURITY DEFINER` fn is public-callable by default | `REVOKE EXECUTE ... FROM public, anon, authenticated` (migration 0004). Re-run `get_advisors` after adding any function. |
| A green PR won't merge (`mergeStateStatus: BLOCKED`, classic protection 404) | the **"Agentic" repo ruleset** enforced `code_scanning`/`code_quality`/`copilot_code_review` with no tooling behind them — front door bolted shut | Inspect via `gh api repos/OWNER/REPO/rules/branches/main`. Wire CodeQL (`.github/workflows/codeql.yml`, `build-mode: none` for JS/TS — no prod build) to satisfy `code_scanning`; PATCH the ruleset to drop rules with no tooling. Required status check is `typecheck · lint · test`. `current_user_can_bypass: always` lets `--admin` bypass in a pinch, but fix the ruleset so the *next* PR isn't blocked too. |
| CodeQL `js/weak-cryptographic-algorithm` (high) on the v5-UUID helper (`createHash("sha1").update(UUID_NS)…`) | RFC-4122 **v5 UUIDs use SHA-1**. The taint source is **`UUID_NS` itself** (the message says "depends on sensitive data from an access to UUID_NS") — CodeQL treats the hex-decoded namespace *constant* as sensitive. So changing the *input* (e.g. routing the user `sub` away) does NOT clear it; ANY SHA-1 hash of that buffer fires. | TWO moves: (1) route user-derived ids through a SHA-256 helper `deterministicUuid()` (version-8) — correct regardless. (2) The SHA-1 `uuidV5()` must STAY for `toUuid()` because prod has rows keyed by those ids (verified: `loop_definition`/`connector_account`/`agent` persisted — changing the algo orphans them). So the remaining alert is a genuine false positive (RFC id derivation of a public constant, no security claim) → **dismiss** via `gh api -X PATCH .../code-scanning/alerts/N -f state=dismissed -f dismissed_reason="won't fix"` (comment ≤280 chars). Dismissal clears the required `CodeQL` check. |
| API route trusts `agentId` from the request body/query (IDOR — any caller acts as any tenant) | server routes derived the tenant from client input with a `DEMO_AGENT_ID` fallback; `getSession()` existed but no route required it | The tenant id is derived **server-side only** via `src/lib/auth/agent.ts`: `requireAgentId()` (mutating routes → 401 when null) / `readAgentId()` (read routes → own workspace or read-only DEMO). Per-user agent = `agentIdForSub(session.sub)` (stable uuid v5). NEVER read `agentId` from a request. Webhooks fail closed (require the secret). |
| vitest marks a test FAILED with a phantom unhandled rejection (e.g. `→ network down`) even though the code under test provably caught it | a **`vi.fn` whose implementation rejects/throws** is tracked in the spy's result history and that rejected promise floats — the caller's `.catch`/`try` does NOT clear it. Plain async rejection + `.catch` is clean (provenable with a 3-line control test). | Mock the rejecting seam with a **plain function** (use a module-scoped `{ calls, impl }` object for steering + call-counting), not `vi.fn`. Also prefer `fn().catch(fallback)` over `try { await fn() }` in the code itself — the handler attaches synchronously. |
| Next 15 typecheck says `cookies()` is a Promise | Next 15 makes request APIs asynchronous | Make session helpers async and await them through auth boundaries; do not cast away the Promise. |
| Vitest 4 rejects `poolOptions.forks.singleFork` | Vitest 4 removed the old pool options shape | Use `fileParallelism: false` and `maxWorkers: 1` for the shared in-memory integration suite. |
| `tsc --noEmit` reports missing `.next/types` files only when run beside `next build` | Both commands race while Next rewrites generated route types | Run typecheck and production build sequentially; a parallel proof runner must treat `.next` as a shared mutable artifact. |
| `git push` works but `gh pr list/view/create` says the token is invalid or cannot reach the API | Git HTTPS credentials and GitHub CLI authentication are separate; macOS Keychain may still authenticate Git while `gh` stores an expired OAuth token | Run `gh auth status`. If invalid, use `gh auth login -h github.com -p https -w`, approve the device code, then rerun `gh auth status` and `gh repo view`. Do not debug the remote or rewrite Git credentials when push already succeeds. |

## Verification quick-reference

- Gates: `npm run typecheck` · `npm run lint` · `npm test` (all must pass).
- Live DB layer: probe via Supabase MCP `execute_sql` (round-trip a row, then delete).
- UI: `preview_start` → `preview_screenshot` (the dev server, not a prod build).
- External provider: one `curl` against the real endpoint with correct headers.

## Secrets rotation runbook

Two secrets the app encrypts data with. Rotation is a deploy-time operation —
there is no live-rekey path. If a key is compromised, follow the corresponding
section below. **Read this BEFORE you have to.**

### `SESSION_SECRET`

What it seals: the session cookie (login state, `googleCredentialRef` pointer,
and any legacy `session.google` tokens still in flight). AES-256-GCM via
`src/lib/auth/session.ts` (`sealValue`/`unsealValue`).

Blast radius if compromised: an attacker with the secret can forge a session
cookie and impersonate any agent who has signed in since the secret was set.
They cannot decrypt `connector_credential` rows (those use the same key —
**rotating session secret invalidates every stored Google credential**) and
cannot read the Supabase database directly (RLS gate on `agent_id`).

**Rotation steps:**

1. Generate a new secret: `openssl rand -hex 32`.
2. Verify the prod env target: `vercel env ls production` (project=`forleads`,
   team=`precious-muwanguzis-projects`). Do NOT push to the wrong project.
3. Replace the existing value: `vercel env rm SESSION_SECRET production`, then
   `echo "<new-hex>" | vercel env add SESSION_SECRET production`.
4. Trigger a fresh prod deploy (the env var only takes effect on cold start).
5. **All connector credentials are now undecryptable** because
   `loadGoogleCredential` calls `unsealValue` with the new key. Users will
   need to re-authenticate Google via `/api/auth/login`. Plan the rotation
   for a low-traffic window.
6. After the deploy is healthy, mark old `connector_credential` rows as
   revoked in Supabase:
   `update connector_credential set revoked_at = now() where revoked_at is null;`
   (RLS-bypassed via service role.) This isn't strictly required — the
   `unsealValue` failure already makes them unusable — but it makes the
   ledger truthful.

**When NOT to rotate:** if the leak is suspected but unconfirmed and the audit
trail is intact (no anomalous events in `domain_event`), prefer to revoke the
specific compromised connector credential rather than reset every user's
Google session.

### Per-credential rotation (no global secret change)

If only a single user's Google token is suspected, you don't need to rotate
`SESSION_SECRET`. Run:

```sql
update connector_credential
   set revoked_at = now()
 where agent_id = '<agent-uuid>'
   and provider = 'google';
```

The user's next approval will fail to find a non-revoked credential (per
`connector_credential_agent_provider_ix`) and they'll be redirected through
`/api/auth/login`. Their cookie still works for read routes; the rest of the
app is unaffected.

### What rotation does NOT do

- Does not invalidate `agent` rows or revoke past Gmail drafts (those already
  landed in the user's Gmail and are owned by them).
- Does not rotate the Google OAuth client secret (that lives in
  `GOOGLE_CLIENT_SECRET`; rotate via Google Cloud Console + Vercel env, same
  pattern).
- Does not rotate the Supabase service role key (`SUPABASE_SERVICE_ROLE_KEY`).
  That's a separate rotation done in the Supabase dashboard.

### When to rotate proactively

- Suspected compromise: anomaly in `domain_event` (e.g., outcome.recorded for
  artifacts the user denies approving).
- Departing operator with deploy access.
- Annually as a baseline hygiene practice — easier to test the runbook
  during planned downtime than during an incident.
