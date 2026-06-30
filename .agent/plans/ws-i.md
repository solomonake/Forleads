# Plan: WS-I · Post-showing seller-update synthesizer (UC-11)

> Model-agnostic. The Notes ingestion, Composer, Compliance linter, and Review
> Tray seams already exist; this packet adds a new **listing-scoped batch
> synthesizer** that turns a window of buyer-feedback notes into one honest
> seller-update draft. Deterministic-first; live Claude only as a refiner with
> total fallback.

**Goal:** `POST /api/seller-update` takes a `listingId` (LeadSurface in
seller-status) plus a window (default last 14 days), gathers buyer-feedback
notes recorded against showings of that listing, deterministically synthesizes
themes (price signal, condition signal, layout signal, location signal,
showing volume), runs them through Composer → Compliance, and drops a single
email artifact into the Review Tray for the seller of record. Live Claude
refines the prose with `*Best()` fallback; facts and themes stay
deterministic.

**Why / value:** UC-11 (`docs/Forleads_UserCases_v1.md:67-71`): "Agent forgets
to update the seller; trust erodes." This is the workflow moat for the
*post-listed* phase — Forleads keeps the seller relationship warm
automatically without inventing facts. Friday-client real-estate agent will
list 2–4 homes; weekly seller updates are the single most common
relationship-decay surface they named.

**User / job:** A listing agent who held an open house or two showings and
collected feedback notes wants a ready-to-send seller update summarizing
*what buyers actually said*, with honest theme grouping and any pricing
signal called out — without retyping or sanitizing each note by hand.

**Pain evidence:**
- `docs/Forleads_UserCases_v1.md:67-71` — UC-11 explicit.
- `src/app/api/` listing shows no `seller-update` route exists today (verified
  via `ls`).
- `src/lib/loops/definitions.ts:14-85` ships four loops; none is triggered by
  a *batch* of notes for a listing. Today, each note is classified
  individually via `/api/notes` and emits `note.created` per-note — the
  seller is never told "here is the digest of feedback so far."
- `src/lib/agents/notes.ts:24-65` keyword matchers are oriented to *buyer/
  prospect* situations (`no_contact`, `objection:*`, `buyer_criteria`), not
  to *post-showing buyer-feedback themes* on a seller's listing. We need a
  second, listing-scoped reducer that lives alongside `classifyNote`.

**Current → desired behavior:**
- Before: agent manually re-reads N showing notes and writes a seller email
  from scratch (or skips it). No artifact in the Review Tray.
- After:
  - `POST /api/seller-update {listingId, windowDays?}` → 201 with the
    drafted artifact id + a `themes[]` summary trace.
  - Drafted email lists 2–5 themes ranked by note-count, each annotated
    with how many showings mentioned it; price signals (e.g. "3 of 5
    parties said price felt 5–10 % high") only appear when ≥2 notes
    independently surface a price phrase. No naked numbers: every theme is
    backed by note-ids the trace can resolve.
  - `GET /api/seller-update?listingId=…` returns the most-recent
    seller-update artifact for the listing (read-only, tenant-scoped).
  - Live Claude path refines prose only; if it throws or returns malformed
    JSON, deterministic body ships. Compliance linter runs AFTER, fail-closed.
  - Artifact lands in the Action Inbox with status `drafted` (human
    approval gate per invariant).

**Non-goals (defer):**
- Auto-send the seller update (Forleads invariant: human approval).
- Scheduled "every Friday auto-digest" cron — v1 is on-demand only. A
  scheduler hook is a follow-up after the workflow is proven.
- Voice-note transcription pipeline for showing feedback (Notes already
  accepts `modality:"voice"` but transcription is upstream of this packet).
- A standalone seller-update UI screen. V1 reuses the Action Inbox row +
  trace drawer. A dedicated "Listing wall" view is downstream.
- Price-range modelling (CMA recompute). The price signal here is the
  *qualitative* buyer reaction, not a re-priced number.
- Multi-listing weekly digest in one email. V1 = one listing per call.

**Risk tier:** **medium**.
- New write path (a draft artifact) and new read of notes across a
  listing window — both tenant-isolated surfaces (IDOR + workspaceSeedId
  rules in `→ playbook.md`).
- No new credentials, no external network egress beyond the existing
  `claudeJSON` seam, no destructive migrations.
- Reuses the fail-closed Compliance linter on the output, so generated
  prose can't bypass.
- Not `high`: no auth/privacy boundary changes, no production-send.

**Context links:**
- `docs/Forleads_Vision_v1.md` (workflow-moat thesis) + UC-11.
- `docs/Forleads_UserCases_v1.md:67-71` (UC-11) and §"Coverage matrix"
  line that names "Note → next-best-action 1, 2, 8, 10, 11".
- `.agent/playbook.md` — seam pattern, no-naked-numbers, fail-closed
  compliance, `composeBest`/`*Best()` fallback rule, IDOR rule, vitest
  rejection-spy gotcha.
- `src/lib/agents/notes.ts:108-188` — `classifyNote` (deterministic) and
  `classifyNoteBest` (live + fallback); pattern to mirror for batch
  synthesizer.
- `src/lib/agents/composer.ts:27-55, 157-349` — `ComposeInput`,
  `ComposeOutput`, `compose()` (deterministic) and `composeBest()` (live
  + fallback). Used as-is; we add one new `Situation`-adjacent input mode.
- `src/lib/agents/compliance.ts` — fail-closed linter; called AFTER
  Composer per existing pipeline.
- `src/app/api/notes/route.ts:1-55` — pattern for tenant-scoped route
  (`ensureCurrentAgent`, `withRoute`, `enforceRateLimit`, `validateBody`,
  `repo.addNote`, `emit`).
- `src/app/api/draft/route.ts` — pattern for "compose + persist artifact"
  flow (review here for artifact persistence shape).
- `src/lib/db/repository.ts:38, 48, 144, 173` — `listLeads`, `listNotes`,
  `listNotes(leadId)` already exist; reuse, no new repo methods needed.
- `src/lib/core/types.ts:193-232, 234-249` — Note, NoteClassification,
  ArtifactStatus, ComplianceFlag shapes.
- `src/lib/pipeline.ts` (via `emit` in notes route) — pattern for emitting
  domain events.

**Seams & exact files:**

*New files:*
- `src/lib/agents/seller-update.ts` — pure batch reducer.
  - `summarizeShowingFeedback(notes: Note[], opts?: { now?: Date; windowDays?: number }): SellerUpdateSummary`
    where `SellerUpdateSummary = { themes: SellerUpdateTheme[]; showingsCounted: number; windowDays: number; noteIds: string[] }`
    and `SellerUpdateTheme = { kind: "price" | "condition" | "layout" | "location" | "volume" | "other"; label: string; mentions: number; supportingNoteIds: string[]; confidence: "A"|"B"|"C"|"D" }`.
  - Deterministic keyword/phrase matchers (mirrors `notes.ts:24-65` style)
    targeted at *buyer-feedback* phrasing ("too small", "kitchen dated",
    "loved the light", "price felt high", "neighborhood concerns",
    "second viewing", etc.). Confidence grade derived from mention-count
    thresholds (≥3 → A, 2 → B, 1 → C, inferred → D — D themes are dropped
    before composing → "no naked numbers" extended to themes).
  - Pure function, no I/O, no Claude. Easy to unit-test.
- `src/lib/agents/seller-update.test.ts` — vitest cases: happy theme rank,
  empty notes → empty summary, single-note theme → C grade not shipped,
  price-signal requires ≥2 notes, opt-out phrasing stripped, window-day
  filter drops out-of-window notes.
- `src/lib/agents/seller-update.live.ts` — thin Claude refiner that takes
  the deterministic `SellerUpdateSummary` + `Agent.brandVoice` and returns
  a polished `{ subject, body }`. Same `claudeJSON` seam + tight
  `maxTokens` + JSON-shape validation. Throws on malformed.
- `src/lib/agents/seller-update.live.test.ts` — fake `claudeJSON` returns
  malformed JSON → caller catches; fake returns empty body → caller
  throws; success path produces sanitized strings.
- `src/app/api/seller-update/route.ts` — `POST` + `GET`.
  - `POST` body: `{ listingId: string, windowDays?: number (1..60, default 14) }`.
  - Auth: `ensureCurrentAgent()` (mutating). 401 if anon.
  - Tenant check: load `LeadSurface listingId`, 404 if `agent_id !== caller`
    (no existence-leak). Confirm `status` is a seller-side status (e.g.
    `appointment | listed | active`) — reject 422 if not.
  - Rate limit via `enforceRateLimit({ name: "compose", perAgent: 10, perIp: 15 })`
    (the synthesizer is heavier than a single note classification).
  - Pipeline:
    1. `notes = await repo.listNotes(listingId)`
    2. `summary = summarizeShowingFeedback(notes, { windowDays })`
    3. If `summary.themes.length === 0` → 200 `{ noUpdate: true, reason: "no in-window feedback" }`, no artifact written.
    4. `composeInput` built from `summary` (themes become evidence-like
       grounded claims with `confidence` A/B/C; D dropped). `actionType: "email"`.
    5. Live refine: `seller-update.live.composeSellerUpdateBest(input)` —
       calls live if `claudeLive()`, falls back to deterministic
       `compose()` body templated from themes. Total fallback on any throw.
    6. Run `complianceLint(payload)` (fail-closed). If `blocked` → artifact
       persists with `status: "blocked"` + flags, returned as such.
    7. `repo.upsertArtifact(...)`, then `emit("seller_update.drafted", {...})`.
  - `GET` body: `?listingId=…` → returns latest seller-update artifact for
    that listing (filter `artifact.kind === "seller_update"` if such kind
    is added, or by `template: "seller_update"` payload marker).
- `src/app/api/seller-update/route.test.ts` — auth-guard (anon → 401), IDOR
  (cross-tenant listingId → 404), wrong-status listing → 422, empty notes →
  `{ noUpdate: true }` + no artifact write, happy path → artifact created
  with themes-grounded body, compliance-blocked path → status=blocked.

*Edited files:*
- `src/lib/agents/composer.ts:106-155` — extend `emailFor()` with a new
  `seller_update` template branch. Input shape stays `ComposeInput` plus a
  new optional `themes?: SellerUpdateTheme[]` field on `ComposeInput`
  (lines 27-41). Renders bullet themes verbatim from `themes`, never
  invents. Subject: `"Update on showings for ${address}"`.
- `src/lib/core/types.ts:197-208` — add `"seller_update"` to a new
  `SellerSituation` union (kept SEPARATE from `Situation` to avoid breaking
  existing matchers/actions), OR add a `kind: "seller_update"` discriminant
  on `ComposeInput`. Decide via probe; smallest change wins.
- `src/lib/pipeline.ts` (or wherever `emit` event names are typed) — add
  `"seller_update.drafted"` to the event-name union if it's a closed
  union; otherwise no-op (verify before edit).
- `src/lib/validation.ts` — add `windowDays` validator (positive int,
  1..60) reusing existing `int`/`optInt` primitives if present, otherwise
  `optStr` + coerce.
- `src/lib/observability.ts` — add `"seller-update"` route key only if a
  hardcoded allowlist exists (the notes route uses `withRoute("notes",…)`
  so this is the same convention).

*Verified NOT touched (the seam is already complete):*
- `src/lib/db/repository.ts` — `listNotes`, `upsertArtifact` already
  present (`grep` confirmed line 48, 173).
- `src/lib/db/supabase-repo.ts` — Note/Artifact maps exist.
- `supabase/migrations/0001_init.sql` — no new tables needed; seller
  update is a normal `artifact` row.
- `src/lib/agents/compliance.ts` — reused as-is.

**Steps:**
1. Probe: read `src/lib/agents/composer.ts:1-50, 200-260` to confirm
   `ComposeInput` extension point and whether `themes` can be passed as
   `evidence` (cards with `kind: "showing_feedback"`). Pick the smallest
   change.
2. Write `src/lib/agents/seller-update.ts` + unit tests first (pure, no I/O).
3. Wire `composer.ts` `seller_update` branch + add the discriminant /
   `themes` field with minimal type churn.
4. Write `src/lib/agents/seller-update.live.ts` + tests using a
   module-scoped fake (not `vi.fn` rejection — see `→ playbook.md` vitest
   gotcha).
5. Write `src/app/api/seller-update/route.ts` (POST + GET) reusing the
   `notes/route.ts:14-54` pattern verbatim.
6. Route tests: auth-guard, IDOR, wrong-status, empty notes, happy,
   compliance-blocked.
7. Local smoke via `npm run dev` + a curl seeding 3 notes against a seeded
   listing → POST seller-update → GET inbox shows the draft → trace shows
   themes + supporting noteIds.
8. Gates: `npm run agent:check -- --risk=medium`.

**Acceptance scenarios:**
- **Happy:** Listing has 5 showing-feedback notes in the last 14 days. POST →
  201 with `{ artifactId, themes:[{kind:"price", mentions:3, confidence:"A"}, {kind:"condition", mentions:2, confidence:"B"}] }`. Body lists exactly those themes with mention counts and no invented numbers. Action Inbox shows a single email artifact `drafted`.
- **No-update / empty:** Listing has 0 in-window notes → POST returns 200 `{ noUpdate: true, reason: "no in-window feedback" }` and zero artifacts written (verified via `listArtifacts` count before/after).
- **Single-note theme:** Listing has 1 note saying "kitchen feels dated" → that theme is grade-D and dropped from the draft (no single-source themes shipped). If no themes survive → `{ noUpdate: true }`.
- **Compliance fail-closed:** Live Claude refiner returns prose containing a familial-status phrase. Composer pre-strips known patterns; if a residual leaks, `complianceLint` blocks → artifact persisted with `status: "blocked"` + flags. NOT silently dropped, NOT auto-fixed.
- **Live Claude failure → fallback:** `claudeJSON` throws → `composeSellerUpdateBest` falls back to deterministic template. The artifact still ships; `fallbackReason` set in `modelUsage`/trace.
- **Tenant isolation / IDOR:** User A POSTs `listingId` owned by B → 404. Confirmed in test.
- **Auth fail-closed:** Anon POST → 401.
- **Wrong listing status:** POST against a buyer-side LeadSurface → 422 with `{ error: "listing required" }`.
- **Idempotent enough:** Calling POST twice in the same minute returns two artifacts (this is *agent intent* to refresh; not deduped) — but the rate-limiter caps at 10/agent/min. Document in route response.

**Break plan (adversarial probes):**
- `windowDays: 0` / `9999` / `"abc"` → validator 400.
- Listing with 1,000 notes — reducer must cap iteration (cap at 200 most-recent in-window notes; emit `truncated:true`).
- A note containing a slur or familial-status phrase — exclusion rules in
  composer strip it; if residual reaches compliance, fail-closed.
- Live Claude returns subject/body that omits one theme — refiner is
  prose-only; theme list comes from the deterministic summary attached to
  the trace, not from Claude. Audit assertion: trace.themes is unchanged by
  Claude's output.
- Two concurrent POSTs same listing — both succeed (intent is explicit);
  rate-limit handles abuse.
- `listingId` is a UUID-shaped string for a non-existent row → 404, no leak.

**Verification evidence:**
- `npm run typecheck && npm run lint && npm test` (gate).
- New route test file proves: 401 path, IDOR path, empty path, happy path,
  blocked path, live-failure fallback path.
- Manual: `bash scripts/smoke.sh` extension — seed listing + 3 notes →
  `curl -X POST /api/seller-update -d '{"listingId":"…"}'` → `curl /api/inbox`
  contains the new artifact whose body cites the seeded note phrases.
- Trace inspection: `/api/trace?artifactId=…` shows
  `{ themes, supportingNoteIds, windowDays, modelUsage, fallbackReason? }`.

**Cost / context budget:**
- Phase budget: ~1 plan + ~5 implement turns + ~2 verify turns.
- Live Claude path: one `claudeJSON` call per POST, `maxTokens: 350`,
  prompt cached. Only invoked when `claudeLive()` true. Deterministic
  fallback always available, so a Claude outage is invisible to users.
- Context sources: this packet, `composer.ts`, `notes.ts`, `notes/route.ts`,
  `compliance.ts`. No need to re-read whole `types.ts` (used slice 193-249).

**Risks / gotchas (`→ playbook.md`):**
- **No naked numbers** extended to themes — themes with `confidence: "D"`
  (single-source / inferred) are dropped before composing.
- **Fail-closed compliance** — linter runs AFTER the live refiner; blocked
  artifacts persist with `status: "blocked"` not silently swallowed.
- **`*Best()` total fallback** — mirror the `composeBest` shape from
  `composer.ts:340-349`: live failure attaches `fallbackReason`, never
  throws to caller.
- **vitest rejection-spy bleed** — fake `claudeJSON` in seller-update.live
  tests must be a module-scoped plain function `{ calls, impl }`, NOT a
  `vi.fn` that rejects (playbook gotcha line 48).
- **IDOR** — load LeadSurface, check `agent_id === caller`, 404 on mismatch
  (no existence leak).
- **Vercel cron double-fire** — N/A here (POST is user-initiated). Future
  scheduler hook would need `claimEvent` keyed by `(listingId, dayKey)`.
- **In-memory test isolation** — vitest already pinned to single fork
  (gotcha line 38); reuse `createInMemoryRepo()`.
- **Tenant-seed ids** — N/A (we don't seed rows for this; only the
  ephemeral artifact has a fresh `uuid()`).

**Rollback plan:**
- All new code is additive (new files + small composer template branch +
  optional one-line type union extension). Revert with a single
  `git revert <merge-sha>` — no destructive migration, no data backfill.
- If only the live refiner misbehaves in prod: set `ANTHROPIC_API_KEY=""`
  (or flip `claudeLive()` env toggle) and the deterministic path ships
  unchanged — no redeploy needed beyond env var.
- If the synthesizer produces noisy drafts: delete the route handler
  (`rm src/app/api/seller-update/route.ts` + revert tests) and redeploy;
  composer template branch can stay (unused).
- No DB migrations; no schema rollback risk.

**Human-in-the-loop:**
- No new secrets. Uses existing `ANTHROPIC_API_KEY` (for live path; absent
  → deterministic fallback).
- No external comms — the artifact ships to the Review Tray, not sent.
- Approval gate: existing `/api/approve` route handles the send; that's the
  right place for the human to verify the seller update before it goes out.

**Done criteria:**
- [ ] `POST /api/seller-update {listingId, windowDays?}` returns either
      `{ artifactId, themes[] }` or `{ noUpdate: true, reason }` and
      writes a single `drafted` artifact only when themes survive.
- [ ] `GET /api/seller-update?listingId=…` returns the latest seller-update
      artifact for that listing (tenant-scoped, 404 on cross-tenant).
- [ ] Themes shipped to the seller cite supporting note-ids in the trace;
      no single-source themes appear in the body.
- [ ] Live Claude failure path produces a deterministic draft (no 500 to
      caller); `fallbackReason` recorded.
- [ ] Compliance-blocked output persists with `status: "blocked"` + flags;
      never silently dropped.
- [ ] Auth-guard test (anon → 401), IDOR test (cross-tenant → 404),
      wrong-status test (422) all pass.
- [ ] `npm run agent:check -- --risk=medium` green.
- [ ] PR body includes a Playwright video walking: seed 3 notes against a
      listing → POST seller-update → see draft in Review Tray with
      themes-grounded body.

**Dependencies (other ws-*.md):**
- **None blocking.** Reducer is pure over `Note.body` strings already in
  the workspace; composer/compliance seams already exist.
- *Soft dependencies (improve quality, not required):*
  - **WS-D · Onboarding (UC-5)** — provides seeded listings/notes so the
    demo has real data. Mock seed covers v1 walkthrough.
  - **WS-C · Market scout + comps** — supplies grade-A/B price evidence
    cards that the seller update can cross-reference when buyers say
    "price felt high". Without WS-C, the price theme is still shipped but
    only reflects buyer reaction, not market backing. Acceptable for v1.
  - **WS-K · Live vision caption** — if photos are added to the seller
    update later, WS-K's captions ground that. Not in v1 scope.
- *Not blocked by:* WS-A, WS-B, WS-E, WS-F, WS-G, WS-H, WS-J, WS-M.

**Estimated hours (solo-founder pace):** **5 h**
- 1 h seller-update reducer + unit tests
- 0.5 h composer template branch + type extension
- 1 h live refiner + tests (with playbook-safe fake)
- 1 h route + auth/IDOR/empty/blocked/fallback tests
- 0.5 h validator + observability + emit wiring
- 0.5 h smoke + Playwright video for PR
- 0.5 h gates + PR write-up (with feedback-questions block per memory rule)

**Open decisions (need human / next-session input):**
- Listing-status whitelist for the 422 check: `appointment | listed |
  active`? Or just any LeadSurface with `status !== "dead"` and
  `intent === "seller"`? The `LeadSurface.status` enum needs a quick read
  to confirm which values exist; pick the strictest set that doesn't
  exclude real Friday-client listings.
- Default `windowDays`: 14 vs 7. Listing agents typically send weekly
  updates; 7 may produce too-empty digests early-week. 14 is a safer
  default but feels stale.
- Should the email include a tasteful CTA ("reply if you'd like to discuss
  a price adjustment") only when the price theme is grade A? Auto-add vs
  always-add vs never. Lean: auto-add only on grade A, leave it to the
  human reviewer to delete if undesired.
