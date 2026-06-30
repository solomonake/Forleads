# Plan: ws-e · CRM overlay sync — FUB + GHL read-only (UC-6)

> Phase 1: pull contacts/leads from Follow Up Boss and GoHighLevel, geocode
> their addresses, and surface them on the living map as overlay-mode
> `LeadSurface` rows. Read-only. Phase 2 (opt-in write-back) is OUT of scope
> for this packet.

**Goal:** An agent with FUB or GHL credentials hits "Sync overlay" once and
within ~60s their CRM contacts (with addresses) appear as map pins on the
Forleads workspace, attributed to provider, never duplicated, with the agent's
CRM remaining unchanged.

**Why / value:** UC-6 is the wedge for experienced pros who reject any tool
that demands migration. Overlay mode = first session value with zero data
loss, zero migration cost. Without this, the entire "pro" segment bounces.

**User / job:** Established realtor on FUB/GHL who wants Forleads' map +
scouts on top of their existing book of business without moving anything.

**Pain evidence:** UC-6 in `docs/Forleads_UserCases_v1.md:37-41` — pro
rejects every new tool that demands migration. Vision treats "two front
doors (CRM-native vs. overlay)" as a powering mechanic (coverage matrix
line 88). Today FUB `syncContacts()` returns a count only with NO rows
written anywhere (`src/lib/connectors/followupboss.ts:99-108`) and GHL
returns a hard-coded `18` with no API call at all
(`src/lib/connectors/gohighlevel.ts:88-93`). Nothing reaches the map.

**Current → desired behavior:**
- Current: `/api/connectors` reports FUB/GHL `mode: live` when keys are
  present, but no overlay rows ever materialize; map shows only leads
  created via `/api/lead`.
- Desired: `POST /api/overlay/sync` fetches contacts page-by-page,
  geocodes each address through `getGeocodeProvider()`, upserts a
  `LeadSurface` per address via `repo.upsertLead`, and emits domain
  events. `GET /api/leads` then includes overlay rows tagged with
  `source: "overlay:<provider>"`.

**Non-goals:**
- Write-back of notes/tasks/appointments (Phase 2; per-artifact write
  already works via existing `Connector.writeCrmNote` etc.).
- Two-way conflict resolution (Phase 2).
- New CRM providers beyond FUB and GHL.
- Real-time webhooks. Phase 1 is on-demand + cron-tickable pull only.
- Migrating Forleads-native leads INTO the user's CRM.

**Risk tier:** **high.** External providers, persistence, tenant
isolation (FUB/GHL creds are per-agent), and PII (names, emails,
phones, addresses of the agent's actual clients). Read-only but still
high — wrong tenant scoping leaks one agent's CRM to another. Per
AGENTS.md §risk: "external providers" + "persistence" + "connectors" all
qualify.

**Context links:**
- `AGENTS.md` invariants — tenant isolation, idempotent connector
  writes, graceful degradation, inspectable traces.
- `docs/Forleads_UserCases_v1.md:37-41` — UC-6 spec.
- `docs/Forleads_Vision_v1.md` — overlay as "second front door."
- `.agent/playbook.md` — Seam pattern, No naked numbers, JIT workspace
  provisioning collision (L41), fail-closed mock writes in prod (L42),
  PostGIS via `fl_upsert_lead_surface` RPC (L43), IDOR rule: derive
  `agentId` server-side only (L47), OSM `User-Agent` required (L39).
- Existing seam: `src/lib/providers/types.ts:18` (`GeocodeProvider`).
- Existing seam: `src/lib/connectors/types.ts` (`Connector`).
- Existing repo helpers: `src/lib/db/repository.ts:37-40` and
  `src/lib/db/supabase-repo.ts:410-414` (`fl_upsert_lead_surface` RPC).
- Connector factory: `src/lib/connectors/index.ts:30,81-110`.
- Env keys already wired: `src/lib/core/config.ts:75-82`.

**Seams & exact files:**

Reuse (no new seam needed):
- `Connector.syncContacts(meta)` already exists. Additively extend its
  return shape to include `contacts?: OverlayContact[]` (existing
  count-only callers keep compiling).
- `GeocodeProvider` (`src/lib/providers/types.ts:18`) — add a single
  new method `geocodeOne(address): GeoResult|null`. Address-string →
  one best hit is materially different from autocomplete; adding a
  method on the existing interface is the right move, not a new seam.
- `LeadSurface` (`src/lib/core/types.ts:170-183`) — already has
  everything except provenance. Add optional `source?: "native" |
  "overlay:followupboss" | "overlay:gohighlevel"` and optional
  `external_id?: string` for upsert idempotency. Both optional → no
  in-memory repo migration needed; the supabase repo needs a tiny
  migration.

New files:
- `src/app/api/overlay/sync/route.ts` — `POST` endpoint. Body:
  `{ provider: "followupboss"|"gohighlevel", since?: ISODate }`.
  Derives `agentId` server-side via `requireAgentId()` (L47).
- `src/lib/overlay/sync.ts` — pure orchestrator
  `(connector, geocoder, repo, agentId, opts) => { imported,
  geocoded, skipped, deduped, errors }`. Testable without HTTP.
- `src/lib/overlay/dedupe.ts` — `(agentId, provider, externalId,
  address) → deterministic upsert id` via
  `workspaceSeedId(agentId, "overlay:"+provider+":"+externalId)` (L41).
  Falls back to address-hash when external id missing.
- `src/lib/overlay/sync.test.ts` — covers acceptance scenarios.
- `supabase/migrations/0005_lead_surface_source.sql` — adds
  `source text`, `external_id text`, partial unique index
  `(agent_id, source, external_id) where external_id is not null`,
  and an updated `fl_upsert_lead_surface` RPC signature (new optional
  params, default null). Re-runnable (`if not exists`).

Touched (additive):
- `src/lib/connectors/followupboss.ts:99-108` — replace `syncContacts`
  body to paginate `/people?limit=100&offset=…&fields=id,name,emails,
  phones,addresses,tags,updated`. Map to `OverlayContact[]`. Honor
  `since` (FUB `updatedAfter` query param).
- `src/lib/connectors/gohighlevel.ts:88-93` — replace stub with
  paginated `GET /contacts/?locationId=…&limit=100&startAfter=…`.
- `src/lib/connectors/types.ts` — add `OverlayContact` type and extend
  `syncContacts` return type (additive).
- `src/lib/providers/types.ts:18` — add `geocodeOne` to
  `GeocodeProvider`.
- `src/lib/providers/mock.ts` — deterministic stub: hash(address) →
  lat/lng inside the workspace bbox.
- `src/lib/providers/real.ts` — call Photon/Nominatim with explicit
  `User-Agent: "Forleads/1.0 (https://forleads.app)"` (gotcha L39).
- `src/lib/core/types.ts:170-183` — add optional `source` +
  `external_id` fields on `LeadSurface`.
- `src/lib/db/repository.ts:147` — pass new fields through `upsertLead`.
- `src/lib/db/supabase-repo.ts:410-414` — pass new fields to the RPC.
- `src/components/ConnectorHub.tsx` (verify exact path with
  `grep -l "Connector" src/components/`) — "Sync overlay" button per
  FUB/GHL row, posts to new endpoint, toasts honest result. Disabled
  when `mode==="mock"` and `mockWritesEnabled===false` (L42).

**Steps:**
1. Add types (`OverlayContact`, extended `syncContacts` return,
   `LeadSurface.source/external_id`, `GeocodeProvider.geocodeOne`).
   Confirm `npm run typecheck` still green (additive only).
2. Write migration `0005_lead_surface_source.sql`. Idempotent.
3. Implement `geocodeOne` in `mock.ts` + `real.ts` with unit tests.
4. Refactor FUB + GHL `syncContacts` to paginate and emit
   `OverlayContact[]`. Cap at 1000 contacts/sync to stay under Vercel
   timeout; honor `since`. Unit-test pagination exhaustion, 401, 429.
5. Write `src/lib/overlay/sync.ts` + `dedupe.ts` + tests covering:
   happy path, missing address (skipped, not errored), geocode fail
   (count `skipped`, not silent drop), duplicate external id
   (deduped on re-run), tenant collision regression (L41).
6. Add `POST /api/overlay/sync/route.ts` using `withRoute("overlay.
   sync")` + `requireAgentId()`. Emit `domain_event` rows
   (`overlay.sync.started`, `overlay.sync.completed`,
   `overlay.sync.failed`) for inspectable traces.
7. `GET /api/leads` (`src/app/api/leads/route.ts`) — no code change;
   new `source` rides along on `LeadSurface`.
8. UI: "Sync overlay" button in Connector Hub for FUB/GHL.
9. Smoke test (mock geocoder + mock connectors), then live FUB sandbox
   if creds exist.

**Acceptance scenarios:**
- *Happy:* Agent with FUB key + `GEOCODER=photon` clicks Sync. 73 of
  80 FUB contacts have parseable addresses → 73 `LeadSurface` rows
  appear on the map within ~90s. Pin tooltip says "From Follow Up
  Boss." FUB is untouched (`GET /people` returns same 80, same
  `updated` timestamps).
- *Empty:* FUB key but zero contacts → `{ imported: 0, geocoded: 0 }`,
  toast "No contacts found," no rows written.
- *Failure — bad creds:* FUB 401s. Endpoint returns
  `409 {ok:false, error: "Follow Up Boss authentication failed;
  reconnect."}`. NO partial rows written. `overlay.sync.failed`
  recorded.
- *Failure — geocoder down:* Address parseable but geocoder times out
  → row not written (`LeadSurface` requires lat/lng); counted in
  `skipped`; toast "12 contacts couldn't be located; they'll retry on
  next sync." Re-running picks them up.
- *Recovery — idempotency:* Click Sync twice in 10s. Second call
  returns `{ imported: 0, deduped: 73 }`. No duplicate rows
  (`select count(*) … where source like 'overlay:%'`).
- *Tenant isolation:* Tenant A + Tenant B both have FUB contact id
  `12345`. Two different `lead_surface.id`s, two different
  `agent_id`s. GET /api/leads as A returns A's only; same for B.
  (Regression for L41.)
- *No naked numbers:* Overlay rows carry
  `{sources:[{kind:"crm",provider:"followupboss"}],
  confidence:"B"}` — geocode A/B by source, contact info B by
  provider attestation. No grade-A facts invented.

**Break plan (adversarial):**
- Malformed contact (address `"see notes"`) → must not crash; skipped.
- Address geocodes to wrong country → upsert B confidence, flag for
  review on next overlay session.
- FUB returns 200 with empty body → treat as zero contacts.
- GHL `startAfter` cursor loops → cap at 1000 contacts + 20 pages;
  abort with `truncated: true`.
- Re-entrancy: two parallel sync requests for same agent → second
  returns `409 sync_in_progress` (advisory lock keyed on
  `agent_id + provider`).
- Stale `since` older than 90 days → ignore, full resync (FUB's
  `updatedAfter` is unreliable beyond that window).

**Verification evidence:**
- `npm run typecheck && npm run lint && npm test`.
- `src/lib/overlay/sync.test.ts` covers all 6 acceptance scenarios.
- Integration probe: `curl -X POST $URL/api/overlay/sync -d
  '{"provider":"followupboss"}' -H "cookie: …"` against the Vercel
  preview, then `curl $URL/api/leads | jq '.leads[] | select(.source
  | startswith("overlay"))' | wc -l`.
- Supabase MCP `execute_sql`: `select agent_id, count(*) from
  lead_surface where source like 'overlay:%' group by agent_id;`.
- `get_advisors` after migration 0005 (gotcha L44 — partial index +
  RPC signature change may flag anon EXECUTE).

**Cost / context budget:**
- Phase budget: ~8 engineering hours.
- Paid-call cap per sync: 1000 contacts × 1 Photon geocode each. With
  self-hosted Photon this is free. With Nominatim cap at 200 (1 req/s
  fair-use). With Mapbox/Google ~$0.50/1000.
- Context sources: this packet, AGENTS.md, playbook, 4 cited files.

**Risks / gotchas:**
- L41 — must use `workspaceSeedId(agentId, …)` for overlay row ids.
- L42 — `mockWritesEnabled=false` in prod factory must mean "Sync
  overlay" returns setup-required, not a fake count.
- L43 — write via `fl_upsert_lead_surface` RPC (geom not REST-able).
- L44 — `get_advisors` after migration; may need explicit `REVOKE
  EXECUTE … FROM public, anon, authenticated` on the updated RPC.
- L47 — server-side `agentId` only.
- L39 — OSM/Photon/Nominatim require `User-Agent`.
- PII surface area expands; confirm Supabase RLS scopes by `agent_id`
  on new columns.
- FUB rate limit ~10 req/s; add `retry(2, expBackoff)` or fail
  gracefully on 429.
- GHL "Agency" vs. "Sub-account" tokens have different scopes;
  document expectation (sub-account / location-scoped).

**Human-in-the-loop:**
- Decisions in "Open decisions" below need user input before
  implementation (surface via AskUserQuestion).
- Secrets: NO new env vars. Reuses `FOLLOWUPBOSS_API_KEY`,
  `GHL_API_KEY`, `GHL_LOCATION_ID` (`src/lib/core/config.ts:75-82`).
  Per-agent OAuth/credential capture is Phase 2.
- Migration 0005 needs `apply_migration` via Supabase MCP — human
  approval (migrations = high risk).
- Merge / deploy gated by human review.

**Done criteria:**
- All steps green.
- All 6 acceptance scenarios pass in unit + integration.
- `get_advisors` clean after migration 0005.
- Vercel preview demonstrates pins appearing for at least one real
  FUB sandbox sync (Playwright video in PR per memory rule).
- Tenant-isolation regression test added and green.

---

### Files touched (concrete)

Create:
- `src/app/api/overlay/sync/route.ts`
- `src/lib/overlay/sync.ts`
- `src/lib/overlay/dedupe.ts`
- `src/lib/overlay/sync.test.ts`
- `src/lib/providers/real.geocode-one.test.ts`
- `supabase/migrations/0005_lead_surface_source.sql`

Edit:
- `src/lib/connectors/followupboss.ts` (lines 99-108)
- `src/lib/connectors/gohighlevel.ts` (lines 88-93)
- `src/lib/connectors/types.ts`
- `src/lib/providers/types.ts` (line 18, add `geocodeOne`)
- `src/lib/providers/mock.ts`
- `src/lib/providers/real.ts`
- `src/lib/core/types.ts` (lines 170-183)
- `src/lib/db/repository.ts` (line 147)
- `src/lib/db/supabase-repo.ts` (lines 410-414)
- `src/components/ConnectorHub.tsx` (verify exact path before edit)

### Acceptance criteria (reviewer checklist)

1. `POST /api/overlay/sync` with a valid FUB session writes one
   `lead_surface` row per geocodeable contact, tagged
   `source: "overlay:followupboss"`, scoped to the caller's
   `agent_id`. Same flow works for `gohighlevel`.
2. Re-running the same sync within 10s returns
   `{ imported: 0, deduped: N }` with zero duplicate rows
   (verified by SQL count).
3. Two distinct tenants with the same FUB external id produce two
   distinct `lead_surface.id`s under two distinct `agent_id`s; cross-
   tenant `GET /api/leads` never leaks (regression for gotcha L41).
4. Bad creds → `409` with a setup-required message, zero partial
   rows, `overlay.sync.failed` domain event recorded.
5. Geocoder-timed-out contacts are reported in `skipped`, never
   silently dropped; next sync retries them.
6. `get_advisors` is clean after migration 0005 lands (any new
   `SECURITY DEFINER` RPC has its EXECUTE revoked from public/anon/
   authenticated per gotcha L44).
7. Overlay rows render distinctly on the map (per design call) and
   carry source/confidence metadata — no naked numbers.

### Rollback plan

- Code: revert the merge commit; the new endpoint and orchestrator are
  additive, no consumers in core flows depend on them. Removing the
  `source` field from `LeadSurface` is safe (optional). The repo's
  upsert path is unchanged for native rows.
- Data: hard-delete overlay rows with
  `delete from lead_surface where source like 'overlay:%';` (safe —
  these rows are reconstructable from the user's CRM on next sync).
- Migration: 0005 is additive (new columns + index + RPC signature).
  Rollback script `0005_down.sql` drops the partial index and the new
  columns; the RPC signature change is backward-compatible because new
  params default null.
- Connector behavior: revert FUB/GHL `syncContacts` to the prior count-
  only shape if the new pagination causes provider issues; the rest of
  the connector (writes) is untouched.

### Open decisions (need user via AskUserQuestion)

1. Multi-tenant overlay: ship Phase 1 single-tenant (env-var creds,
   one CRM per Forleads instance) OR require per-agent credential
   capture from day one? Env-var path is faster but blocks real
   multi-tenant launch.
2. Geocoder choice in prod: self-host Photon (free, fast, ~2GB RAM)
   vs. Nominatim public (rate-limited) vs. paid (Mapbox/Google,
   ~$0.50/1k). Affects sync throughput cap.
3. Pin visual treatment: distinct color/shape for overlay rows vs.
   native rows, or unified pins with a provenance chip in the
   tooltip? (Design call — defer to the ws-* that owns map UI.)

### Dependencies

- No hard dependency on other ws-* packets.
- Soft dependency on **ws-D** (Onboarding "10-min CRM" / UC-5): both
  packets need `GeocodeProvider.geocodeOne`. Whichever ships first
  introduces the method; the second one consumes it. If ws-D ships
  first, step 3 here collapses to "verify `geocodeOne` already
  exists."
- No dependency on ws-J ("flip real send live") because Phase 1 is
  read-only — zero connector writes touched.

**Estimated hours: 8** (solo-founder pace)
- 1.5h types + migration + RPC update
- 1.5h connector pagination refactor (FUB + GHL)
- 1.0h `geocodeOne` in both providers + tests
- 2.0h overlay orchestrator + dedupe + tests
- 0.5h API route
- 0.5h Connector Hub button + honest toasts
- 1.0h cross-tenant regression + Supabase probe + advisor sweep
