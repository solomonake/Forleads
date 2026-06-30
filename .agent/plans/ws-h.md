# Plan: WS-H · Listing copy + ad creatives (UC-8)

> Model-agnostic. Everything a model needs is here — don't rely on the model
> "being smart." If a step needs intelligence, specify it.

**Goal:** When an agent wins a listing, a single composer call produces a
**multi-artifact set** — (1) listing description, (2) three social ad variants
each with a CTA, and (3) a just-listed neighbor letter — all in the agent's
brand voice, all citing only grounded `EvidenceCard`s, all individually
fail-closed lint-checked, and all landed as separate `Artifact` rows
(status `drafted` or `blocked`) in the Review Tray ready for one-tap approve.

**Why / value:** UC-8 today costs the agent hours in Canva + copywriting and
is a common reason they reject "AI" tools that hallucinate features. This is
the single highest-leverage Composer use case (multi-artifact output from one
prompt context), and it converts a closed deal into immediate marketing
output — the moment an agent feels Forleads "earn its keep" on a paid listing.
For the Friday real-estate client this is the demoable artifact set that
proves "the map writes the marketing."

**User / job:** Listing agent who just signed a listing agreement, has a
handful of property photos, and needs (a) MLS-ready description, (b) ad copy
for FB/IG/X, and (c) a "just listed" neighbor mailer — within minutes, in
their voice, without invented features and without fair-housing risk.

**Pain evidence:**
- `src/lib/agents/composer.ts:163-232` — `compose()` `switch (actionType)`
  only handles `email | sms | task | calendar | crm_note`. There is no
  `listing` or `ad` artifact type today, and `ACTION_TYPES` at
  `src/lib/core/types.ts:236` is the closed set wired into `/api/draft`
  (`src/app/api/draft/route.ts:17`).
- `docs/Forleads_UserCases_v1.md:49-53` (UC-8) literally promises
  "Composer drafts the listing description, 3 social ad variants with **CTAs**,
  and a just-listed neighbor letter — all drafts to Review Tray." None of
  that ships today.
- `src/lib/pipeline.ts:345` (`draftArtifact`) is single-artifact in / single
  `Artifact` out — there is no fan-out path that takes one trigger and
  returns N drafts as one Review-Tray bundle.

**Current → desired behavior:**
- *Current:* agent has no in-product path to generate listing collateral;
  they leave for Canva.
- *Desired:* `POST /api/listing/draft { leadId, photos?, listPrice?, voice? }`
  → returns `{ bundle: { id, artifacts: Artifact[5] } }`:
  - 1× `listing_description` (long-form, MLS-style, ≤3000 chars)
  - 3× `ad_creative` (one per platform: facebook | instagram | x), each
    with a CTA string, image-slot hint, and ≤280-char body for X / longer
    for FB/IG
  - 1× `neighbor_letter` (postal-mailer body, address-of-listing in subject)
  Every artifact is lint-checked individually. A blocking flag on ANY
  variant marks that one `blocked` (`pass:false`) but does NOT block the
  others. Each cites only grounded `EvidenceCard`s from the lead (and from
  WS-A's comps when present); no naked prices unless a comp card is cited
  or `listPrice` was provided by the user (in which case the source is
  literally the agent's input — that counts as a cited source).

**Non-goals:**
- No image generation. We hint at image slots but do not produce visuals.
- No social-platform posting / scheduling (that's WS-J + future).
- No MLS submission API integration (every market is different; the
  description is copy/pasteable for the human).
- No new compliance categories — reuses `compliance.ts` rules as-is.
- No new live-Claude prompt for the deterministic stub path; the
  `composeBest`-style live wrap is a stretch goal (steps 8–9) but the
  deterministic path must ship the full bundle on its own.
- No persistence schema change for the bundle as a first-class object —
  we use a shared `bundle_id` column on `Artifact` rather than a new table.

**Risk tier:** **medium.** No new auth boundary, no new connector writes, no
PII, no migration that changes RLS. Touches the Composer + the draft API,
both of which already have the fail-closed lint pattern in place. Per
AGENTS.md §risk tiers, "normal product behavior." Bumps to **high** only if
WS-J flips real-send on the new artifact types in the same PR (it must not).

**Context links:**
- `AGENTS.md` — invariants (no naked numbers, fail-closed compliance,
  human approval, graceful degradation, inspectable traces).
- `docs/Forleads_Vision_v1.md` §7 anti-goal #2 (no auto-send), §10 month-3
  ("social-ad/listing generation" — explicitly the target).
- `docs/Forleads_UserCases_v1.md:49` UC-8 — full acceptance scenario.
- `.agent/playbook.md` — "Seam pattern", "No naked numbers", "Live AI =
  one seam + total fallback", "Foundation before surface".
- `.agent/plans/ws-a.md` — provides the comps `EvidenceCard`s this bundle
  cites for ad copy ("comparable sold $612k in March 2026, 180m away").
- `.agent/plans/ws-c.md` — provides the deterministic comps-scoring layer
  Composer reads from for the "what your home could enable" framing.
- `src/lib/core/types.ts:236` — `ACTION_TYPES` (closed enum; we extend).
- `src/lib/core/types.ts:294` — `ArtifactPayload` union (we extend with
  `ListingDescriptionPayload`, `AdCreativePayload`, `NeighborLetterPayload`).
- `src/lib/agents/composer.ts:157-232` — `compose()` switch site to extend.
- `src/lib/agents/compliance.ts:139` — `lintArtifactText()` already accepts
  arbitrary string parts; reusable per artifact.
- `src/lib/pipeline.ts:345` — `draftArtifact()` is the persistence + trace
  template to mirror for each of the 5 artifacts in the bundle.
- `src/app/api/draft/route.ts` — the validation + rate-limit + repo-fetch
  pattern to mirror in the new `/api/listing/draft` route.
- `src/app/api/inbox/route.ts` + `/api/artifacts/[id]/route.ts` — Review
  Tray reads; bundle artifacts must list naturally (no UI change needed
  beyond surfacing the new `type` strings).

**Seams & exact files:**

*Edits (existing):*
- `src/lib/core/types.ts:236` — extend `ACTION_TYPES` with
  `"listing_description" | "ad_creative" | "neighbor_letter"`. **This is the
  contract change** — every downstream `switch` over `ActionType` must be
  audited (composer, pipeline, connectors, Review Tray UI). Per playbook
  "Foundation before surface": fix the type first, fix the call sites next.
- `src/lib/core/types.ts:294` — add three payload interfaces to the
  `ArtifactPayload` union: `ListingDescriptionPayload { headline; body;
  highlights[]; }`, `AdCreativePayload { platform: 'facebook'|'instagram'
  |'x'; body; cta; imageSlotHint; }`, `NeighborLetterPayload { subject;
  body; listingAddress; }`.
- `src/lib/core/types.ts:316` — add optional `bundle_id?: UUID` on
  `Artifact` so the Review Tray can group the 5 drafts.
- `src/lib/agents/composer.ts:157-232` — extend `compose()` `switch` with
  three new branches that build the deterministic payload per type from
  the same `ComposeInput` (the input must carry `listPrice?`, `photos?`,
  and `platform?` so one call composes one variant at a time). Reuse
  `applyExclusions` on every text field before returning.
- `src/lib/agents/composer.ts:340` — keep `composeBest()` deterministic
  for these three types in v1 (no live-Claude wrap). Live wrap is a
  follow-on; the fallback contract still holds.
- `src/lib/pipeline.ts:345` (`draftArtifact`) — extract a small
  `persistArtifact(...)` helper if needed; or keep `draftArtifact` as the
  single-artifact primitive and have the new bundle function call it 5x.
- `src/app/api/draft/route.ts` — no change. The new route is separate so
  `/api/draft` continues to handle 1:1 single-action drafts.

*New files:*
- `src/lib/agents/listing-bundle.ts` — orchestrator. `composeListingBundle(
  { agent, lead, evidence, listPrice?, photos?, brandVoice? })` → returns
  `{ bundleId, drafts: ArtifactDraft[5] }` where each draft is the
  intermediate (payload + compliance + evidence + promptVersion) shape that
  `draftArtifact()` already knows how to persist. Pure orchestration on
  top of `compose()` + `lintArtifactText()`; no I/O.
- `src/lib/agents/listing-bundle.test.ts` — unit tests for shape, lint
  isolation per variant, evidence citation enforcement, brand-voice
  propagation, idempotent bundleId.
- `src/lib/pipeline.listing-bundle.test.ts` — integration test that runs
  through the in-memory repo and asserts 5 `Artifact` rows with the same
  `bundle_id` are persisted, each with its own `compliance_result`.
- `src/app/api/listing/draft/route.ts` — new POST route. Validates
  `{ leadId, listPrice?, photos?, brandVoiceOverride? }`, rate-limits
  per agent (reuse `enforceRateLimit` name `compose-listing`, lower cap
  e.g. `perAgent: 10` since it's 5x heavier), calls
  `composeListingBundle`, persists via 5 `draftArtifact` calls in one
  loop, returns `{ bundleId, artifacts }`.
- `src/app/api/listing/draft/route.test.ts` — happy / auth-missing /
  rate-limited / lead-not-found / empty-evidence-graceful paths.

*Optional (only if decided):*
- `src/lib/agents/composer.live.listing.ts` — live-Claude wrap for the
  listing description only (the longest, highest-value text). Gated by
  `claudeLive()`, total fallback to deterministic. **Open decision** —
  see below.

**Steps:**
1. **Extend the type contract first** (`src/lib/core/types.ts`): add the
   three new `ACTION_TYPES`, the three new payload interfaces in the
   `ArtifactPayload` union, and the optional `bundle_id` on `Artifact`.
   Run `npm run typecheck` and fix every fall-out site (composer switch,
   any payload-typed UI). Per playbook "Foundation before surface."
2. **Extend `compose()`** with three deterministic branches:
   - `listing_description`: pull the top 3–5 non-D `EvidenceCard`s; turn
     each into a one-line highlight; build a headline using the
     property address and brand-voice greeting style (reuse
     `voiceGreeting`/`voiceSignoff`); body = "Welcome to {address}.
     {highlights joined}." If `listPrice` is provided it appears in the
     body cited as `(source: list price)`. Run `applyExclusions` on
     headline + body.
   - `ad_creative`: branch on `platform`. Each variant has a distinct
     CTA string (FB "Schedule a tour," IG "DM for details," X "Reply for
     the full sheet"). Body length capped per platform (FB 500, IG 400,
     X 280). Image slot hint = `"hero exterior wide-angle"` etc. Apply
     exclusions.
   - `neighbor_letter`: subject = `"Just listed on {street}"`; body
     references the property, ends with a "if you've thought about
     selling, I have buyers actively looking" cited-only-if-comps-exist
     line, signs off with `voiceSignoff`. Apply exclusions.
3. **Write `composeListingBundle()`** in `src/lib/agents/listing-bundle.ts`.
   Generates one stable `bundleId` (`newUUID()`), calls `compose()` five
   times with the right `actionType`/`platform`, returns the five
   intermediate drafts.
4. **Lint each draft individually** with `lintArtifactText()`. A block on
   the X variant must NOT block the FB or neighbor letter. Each draft
   carries its own `ComplianceResult`. Status is `blocked` for the
   variant whose lint failed, `drafted` for the others.
5. **Persist via `draftArtifact()`** (one call per draft) inside the new
   route, attaching the shared `bundle_id`. Use the existing
   `model_trace` shape; `mode: "mock"` for the deterministic path,
   `mode: "live"` only when we add the live wrap.
6. **Wire `/api/listing/draft`** mirroring `src/app/api/draft/route.ts`:
   `ensureCurrentAgent`, `enforceRateLimit({name:"compose-listing",
   perAgent:10, perIp:15})`, repo lookup, bundle compose, persist,
   respond.
7. **Verify Review Tray surfaces the bundle:** `/api/inbox` already
   returns all `Artifact` rows for the agent (`src/app/api/inbox/route.ts`).
   Confirm the new `type` strings render — if the existing UI hard-codes
   icons per action type, add three SVG icon slots; otherwise no UI work.
   *This is the only UI risk; capture in adversarial verify.*
8. **(Optional, gated) Live Claude wrap** in
   `src/lib/agents/composer.live.listing.ts`: only the
   `listing_description`. Same fallback discipline as `composeBest()` —
   any throw falls back to deterministic. **Open decision: ship live
   wrap in v1 or defer to a v2 PR?**
9. **Tests:**
   - unit: bundle returns 5 drafts, correct type distribution
     (1×description, 3×ads {fb,ig,x}, 1×letter), brand voice respected.
   - unit: an ad with `kids' bikes` in evidence reasoning is stripped
     pre-lint (defense in depth, `applyExclusions`), and a block in one
     variant does not block others.
   - unit: empty `evidence[]` returns a bundle that still produces an
     honest description ("This newly-listed home awaits your visit.")
     with no naked numbers; `listPrice` absent → no price token; status
     `drafted` not `blocked` (graceful degradation invariant).
   - integration: through the in-memory repo, 5 `Artifact` rows persist
     with the same `bundle_id`, each with its own lint result.
   - route: 401 without auth, 404 unknown lead, rate-limited after 11
     calls, happy 200 returns `{ bundleId, artifacts: Artifact[5] }`.
10. **Gates:** `npm run typecheck && npm run lint && npm test`; then
    `npm run agent:check -- --risk=medium`. Per memory rule "Video in
    PR required," attach a Playwright capture of an agent triggering the
    bundle and seeing 5 cards in the Tray.

**Acceptance scenarios:**
- *Happy path (mock, with comps from WS-C):* `POST /api/listing/draft`
  with a leadId that has ≥3 grade-B/A `EvidenceCard`s returns
  `{ bundleId, artifacts: [5] }` in ≤1.5s. Each artifact's
  `compliance_result.pass === true`. Each `evidence_used.length ≥ 1`
  (except `neighbor_letter` may use 0 if no comps).
- *Partial block:* a lead whose evidence includes the phrase "great for
  families" produces 4 `drafted` + 1 `blocked` artifact (the ad variant
  that interpolated the offending phrase). The other 4 are independently
  approvable. Review Tray badge shows `4/5 ready`.
- *Empty evidence:* lead with no grounded cards still returns 5 drafts;
  description body explicitly says "Details forthcoming — schedule a
  tour to see this home in person." No naked numbers. No fabricated
  features. Status `drafted`.
- *Brand-voice override:* request body with `brandVoiceOverride:"luxury"`
  produces description headline matching the `voiceGreeting("luxury")`
  cadence; the agent's persisted `brandVoice` is unchanged.
- *Auth/limits:* request without session → 401. 11th request in a window
  → 429 from `enforceRateLimit`.
- *Idempotency for UI:* hitting the route twice in quick succession
  produces two DIFFERENT `bundleId`s (we are NOT idempotent on the
  request — by design; this is a creative-generation route, the human
  may want a re-roll). Document this in the route comment.

**Break plan (adversarial):**
- *Lead with `listPrice` but no comp cards:* the description must NOT
  invent comp framing. Test asserts the body has no `$` outside the
  explicit `listPrice` line.
- *Evidence card containing protected-class language:* exclusions strip
  it BEFORE prompt assembly; lint catches anything that slips through.
  Test with `cards[0].claim = "near churches"`.
- *Photo array of 50 entries:* the route truncates to 6 hints; no
  per-photo cost amplification.
- *Bundle persistence partial failure:* if the 4th `draftArtifact` call
  throws, the route returns the 3 successful artifacts + a structured
  error; do not orphan a half-bundle without surfacing it. Use a
  try/per-artifact loop (per playbook "Audit unwrapped awaits" — every
  `await` gets its own try/catch).
- *Type-switch fall-out:* a downstream consumer that does
  `switch(actionType) { default: throw }` will crash on the new types.
  Run `tsc --noEmit` after step 1; fix exhaustively before step 2.
- *Stale Review Tray client:* if the UI does
  `if (type === 'email') ... else null`, new types render blank. Add a
  fallback chip with `type` as the label so nothing disappears.

**Verification evidence:**
- `npm run typecheck && npm run lint && npm test` green.
- `npm run agent:check -- --risk=medium` green.
- `npm test -- src/lib/agents/listing-bundle.test.ts` green.
- `npm test -- src/app/api/listing/draft/route.test.ts` green.
- `curl -X POST http://localhost:3000/api/listing/draft -H 'cookie: ...'
  -d '{"leadId":"<seeded>"}'` → 200 with 5 artifacts.
- Playwright: trigger the listing button → 5 cards visible in Tray, the
  blocked variant shows the compliance flag inline.
- `grep -nE 'switch \(.*actionType.*\)' src/` returns only the
  expected sites; each has the 3 new branches.

**Cost / context budget:**
- Build: ≤25k context tokens (this packet ~3k; type edits ~1k; composer
  branches ~3k; bundle + route ~4k; tests ~6k).
- Paid: $0 in v1 (deterministic). If the optional live wrap ships,
  ≤$0.10 per bundle (Claude Haiku-class for the listing description
  only; ad copy + neighbor letter stay deterministic).
- Runtime: target ≤1.5s end-to-end for the deterministic bundle (5
  pure-function calls + 5 in-memory repo inserts).

**Risks / gotchas:**
- `.agent/playbook.md` — "Foundation before surface": **extend the
  `ACTION_TYPES` enum first** and fix every TypeScript fall-out before
  writing the composer branches; otherwise the switch statements ship
  with silent `default` holes.
- `.agent/playbook.md` — "No naked numbers": the `listing_description`
  branch is the easiest place to leak an unsourced number (sqft, year,
  price). Enforce: every numeric token in the rendered body MUST trace
  to an `EvidenceCard` in `evidenceUsed` or to the user-provided
  `listPrice` (which counts as a cited source labeled "list price").
- `.agent/playbook.md` — "Audit unwrapped awaits": the 5x persist loop
  must catch per-artifact so one DB failure doesn't lose the bundle.
- `.agent/playbook.md` — "Live AI = one seam + total fallback": if the
  optional live wrap is included, follow the `composeBest()` pattern
  exactly — `.catch` attaches synchronously, never `try { await }`.
- New gotcha to watch: the compliance linter is text-only; it does not
  see structured fields like `cta` or `imageSlotHint` if we forget to
  pass them. `lintArtifactText([headline, body, cta, imageSlotHint])`
  for every artifact — pass ALL human-readable strings.
- UI fall-out: confirm the inbox chip component doesn't crash on
  unknown `type`. Add a regression test in `src/app/api/inbox/...` if
  needed.

**Human-in-the-loop:**
- *Decision:* "Ship live-Claude wrap for `listing_description` in v1, or
  defer to a v2 PR?" — see Open decisions.
- *Decision:* "Bundle re-rolls = new bundleId (current plan) vs
  replace-in-place?" — current plan is new bundleId for safety; confirm.
- *Approval:* PR review only. No external send, no secrets, no migration.
- *Connector approval:* none in this WS. WS-J owns the actual send /
  schedule of these artifacts; this WS strictly drafts.

**Dependencies on other workstreams:**
- **WS-A · Live property/owner data adapter** — provides the
  owner/year/lot `EvidenceCard`s the description cites. Without WS-A the
  description still ships (graceful degradation), but with thin facts.
  Required EvidenceCard shape: `{ claim, value?, confidence, sources[] }`
  per `src/lib/core/types.ts:26` — unchanged.
- **WS-C · Market scout + comps scoring** — provides graded comp
  `EvidenceCard`s the ad variants quote ("comparable sold $X within Ym
  in the last Nmo"). Without WS-C the ads ship without comp framing
  (still useful, just thinner). Required: at least one non-D card in
  `evidence` whose `claim` starts with `"Comparable sale"`.
- No dependency on WS-J. This WS draft-only; flipping send is WS-J's job.

**Estimated hours (solo-founder pace):** **5–7 hours**
- 0.5h extend `ACTION_TYPES` + payload union + audit type fall-out.
- 1.5h extend `compose()` with 3 deterministic branches + exclusions.
- 1h `composeListingBundle()` orchestrator + lint-per-variant wiring.
- 1h `/api/listing/draft` route + auth + rate-limit.
- 1.5h unit + integration + route tests.
- 0.5h Playwright video + PR write-up with the 3–6 feedback questions
  (per memory rule "Feedback before merge" P2).

**Done criteria:**
- [ ] `ACTION_TYPES` extended; `tsc --noEmit` clean across `src/`.
- [ ] Three new payload types in `ArtifactPayload` union.
- [ ] `compose()` returns deterministic payloads for the three new types
      with brand-voice + exclusions applied.
- [ ] `composeListingBundle()` returns exactly 5 drafts with a shared
      `bundleId`, each independently lint-checked.
- [ ] `/api/listing/draft` persists 5 `Artifact` rows (same `bundle_id`),
      returns them in the response.
- [ ] A blocking lint flag on one variant does NOT block the other four.
- [ ] Empty-evidence path still produces 5 drafts with no naked numbers
      and `status: "drafted"` (graceful degradation invariant).
- [ ] All gates green: typecheck, lint, test, `agent:check --risk=medium`.
- [ ] PR body includes Playwright video of the Tray showing the 5
      bundle artifacts and the blocked-variant flag (per memory P1
      "Video in PR required").
- [ ] PR body includes 3–6 SPECIFIC feedback questions + Vercel toolbar
      CTA (per memory P2 "Feedback before merge").
- [ ] No outbound send wired (UC-8 stops at the Tray; WS-J owns send).

**Open decisions (needs human input):**
1. Ship the live-Claude wrap for `listing_description` in v1, or defer to
   a v2 PR after the deterministic bundle proves out?
2. Three social platforms = `facebook | instagram | x` — is X the right
   third (vs LinkedIn or TikTok caption) for the Friday client's
   audience?
3. Neighbor-letter format — postal-style body only, or do we also emit a
   second `email` artifact for digital "just listed" blasts? Current
   plan: postal body only; email blast is a follow-on.
4. Bundle re-roll semantics: each retry creates a new `bundleId` (current
   plan, safer audit) vs replaces in place (cleaner Tray)?
