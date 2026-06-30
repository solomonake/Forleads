# Plan: WS-K — Live vision caption (Gemini)

> Model-agnostic. Everything a model needs is here — don't rely on the model
> "being smart." If a step needs intelligence, specify it.

**Goal:** Behind a feature flag (`FORLEADS_VISION=gemini` + `GEMINI_API_KEY`),
have `ImageryScout` enrich each Mapillary frame it found with a graded
vision-derived caption (visible style, condition, story-count, materials,
roof shape, garden) as **typed EvidenceCards with sources + confidence A–D**.
Fail-soft to the existing mock/no-caption path on any error, missing key,
timeout, or quota. Never assert hidden facts ("needs a new roof") without an
explicit grade and source.

**Why / value:** UC-7 ("Snap a house → vision-grounded context") and UC-8
("Listing copy + ad creatives") are the two surfaces that demand grounded
visual context. Today, the `MapillaryImageryProvider` only reports *how many*
frames exist, never *what* is in them. WS-H (listing copy) and the
valuation/Composer pipeline both starve for visible facts. Adding a
fail-soft vision step turns Mapillary from a coverage check into a real
evidence source — without breaking the "no naked numbers" invariant.

**User / job:** A licensed agent taps a property on the map and expects the
swarm to surface visible features ("pitched roof, mature garden, two
stories — confidence C, from 3 Mapillary frames") that they can paste into a
listing draft, a CMA, or a door-knock script — and *trust* because each
claim cites the source image set and an explicit confidence.

**Pain evidence:**
- `docs/Forleads_UserCases_v1.md:43-47` (UC-7) names "Imagery Scout (Gemini
  vision)" as the loop, but no Gemini call exists today.
- `src/lib/providers/real.ts:229-281` — `MapillaryImageryProvider.street()`
  returns at most a count card; never describes the imagery.
- `src/lib/agents/scouts.ts:88-102` — `runImagery` consumes only `provider.street(q)`
  output, so there is no seam for a captioning step downstream of frames.
- `grep -ri "gemini" src/` → no hits. No vision provider exists; the seam
  must be added.
- UC-8 listing copy (WS-H) will repeatedly produce generic prose because
  Composer has no visible-feature EvidenceCards to anchor on.

**Current → desired behavior:**
- *Current:* `runImagery` returns ONE card: `{claim:"Street imagery",
  value:"N frames", confidence:"A", sources:["Mapillary","CC-BY-SA"]}` or a
  grade-D gap. Vision is absent. Composer/listing copy has no visible
  features to cite.
- *Desired:* With flag enabled and key present, `runImagery` returns the
  count card PLUS up to ~4 graded caption cards (style/condition/stories/
  materials), each citing both the source frame ids on Mapillary AND the
  Gemini model id, with confidence ≤ B by default (vision is inference, not
  fact). With flag off, key missing, quota hit, timeout, or any throw, the
  output is byte-identical to today's behavior — fail-soft, never crash.

**Non-goals:**
- Photo upload from the agent's phone. We caption Mapillary frames; user-
  photo capture is a separate surface (would create privacy questions WS-K
  does not own).
- Hidden-fact assertions ("needs new roof", "water damage inside"). The
  prompt and post-validator both refuse any claim about non-visible
  conditions. If Gemini returns one, it becomes a grade-D gap, not a card.
- Owner-attribute inference from imagery (people in frame, vehicles ⇒
  income). Fair-housing trap. Hard-banned in the validator.
- Caching beyond the existing scout cache layer
  (`src/lib/agents/scouts.ts:236`). Vision calls already cache for 6h by
  normalized address via the existing `runScoutCached` path.
- Multi-frame stitching / panorama. Per-frame caption, deterministic merge.
- Replacing the Mapillary count card. The count remains as the high-grade
  "coverage" signal; captions are additive.
- A new UI surface. Existing `EvidenceCard` chip + Composer consume the new
  cards via the same shape.

**Risk tier:** **high.** External paid provider (Gemini API spend),
agent-policy surface (visible-only / no fair-housing / no hidden-fact
assertions), and graceful-degradation requirement per AGENTS.md invariants.
Per AGENTS.md §risk tiers: external provider + agent policy + spend ⇒
**high**. Requires coverage, build, adversarial tests, rollback notes, and a
security/compliance reviewer pass on the prompt + validator.

**Context links:**
- `docs/Forleads_UserCases_v1.md:43-47` (UC-7), `:89` ("Vision grounding ↦ 7,8").
- `docs/Forleads_Vision_v1.md` — "no naked numbers", grounding moat,
  graceful degradation.
- `.agent/playbook.md` — "Seam pattern" (every external dep = typed
  interface + mock/real + one env var), "No naked numbers" (providers
  return grade-D gaps, never inventions), "Live AI = one seam + total
  fallback" (one `*Best()` entry, fall back on ANY throw).
- `.agent/plans/live-claude.md` — pattern to mirror for the Gemini seam
  (timeout, single retry, typed error, low max_tokens, cached system
  block, server-only import).
- Existing seams to reuse (do NOT re-invent):
  - `src/lib/providers/types.ts:40-45` — `ImageryProvider` interface.
    `street()` already returns `EvidenceCard[]`; vision cards fit the
    existing return type without changing the interface signature.
  - `src/lib/providers/real.ts:224-286` — `MapillaryImageryProvider`. Add a
    `visionCaptioner?: VisionCaptioner` constructor arg and call it after
    the frames query.
  - `src/lib/providers/index.ts:46-51` — `getImageryProvider()`. Inject the
    captioner here based on `config.visionProvider`.
  - `src/lib/core/config.ts:30-94` — config object. Add
    `visionProvider` + `geminiKey` + a `visionLive()` helper (mirrors
    `claudeLive()` at `:108-110`).
  - `src/lib/agents/scouts.ts:88-102` (`runImagery`) — needs **no change**;
    the new cards arrive as extra entries in `provider.street(q)`.
  - `src/lib/agents/scouts.ts:236-247` (`runScoutCached`) — already caches
    by normalized address. Vision spend is automatically deduped.

**Seams & exact files:**

*New files:*
- `src/lib/providers/vision/types.ts` — `interface VisionCaptioner { name; mode:'mock'|'live'; caption(input: VisionInput): Promise<EvidenceCard[]> }`.
  `VisionInput = { frameUrls: string[]; frameIds: string[]; address: string; lng: number; lat: number }`.
- `src/lib/providers/vision/gemini.ts` — `GeminiVisionCaptioner` implements
  `VisionCaptioner`. One method, `caption()`:
  1. Bound input: max 3 frames, 8s total timeout, 1 retry on 5xx, no retry
     on 4xx.
  2. Build the system+user prompt from `prompt.ts` (see below).
  3. POST to `generativelanguage.googleapis.com` (model:
     `gemini-2.5-flash` by default, configurable via `FORLEADS_VISION_MODEL`).
  4. Parse JSON response → run `validateCaption()` → map to
     `EvidenceCard[]` with `scout:"imagery"`, `confidence ≤ "B"`,
     `sources: [{name:"Mapillary", url:frameUrl}, {name:"Gemini "+model}]`,
     and `reasoning` populated from the model's own short rationale.
  5. On ANY throw / non-2xx / validator-rejected output → return `[]` (NOT
     a grade-D gap; the count card from Mapillary already documents
     coverage; the absence of captions degrades silently per playbook).
- `src/lib/providers/vision/prompt.ts` — `SYSTEM` constant + `userPrompt(input)`.
  Hard rules embedded in the system block:
  - "Describe ONLY what is visibly present in the frames."
  - "NEVER infer interior condition, plumbing, electrical, age, value, or
    occupancy."
  - "NEVER describe people, vehicles, or demographic-adjacent attributes."
  - "If a feature is not clearly visible, omit it; do not guess."
  - Response is strict JSON: `{ captions: Array<{ claim: string; value: string; confidence: "A"|"B"|"C"|"D"; reasoning?: string }> }`.
  - Max 4 captions; allowed `claim` values are a closed set: `style`,
    `condition`, `stories`, `materials`, `roof`, `landscaping`.
- `src/lib/providers/vision/validate.ts` — `validateCaption(raw): EvidenceCard[]`.
  - JSON shape check; closed-set claim allowlist; confidence ∈ A..D; force
    `confidence = "C"` if model returned "A" (vision is never grade-A per
    playbook "no naked numbers"); banlist regex (e.g. `\b(needs?|requires?)\s+(a\s+)?(new|replacement)\b`, `\b(plumbing|wiring|electrical|HVAC|foundation)\b`, demographic terms list) → reject the offending card; if all rejected, return `[]`.
- `src/lib/providers/vision/mock.ts` — `MockVisionCaptioner` returns a
  deterministic, address-seeded fake caption set for tests + dev.
- `src/lib/providers/vision/index.ts` — `getVisionCaptioner(): VisionCaptioner | null`.
  Returns `GeminiVisionCaptioner` only when `visionLive()` is true; returns
  `MockVisionCaptioner` when `FORLEADS_VISION=mock`; returns `null`
  otherwise (caller treats null as "skip vision").
- Tests:
  - `src/lib/providers/vision/gemini.test.ts` — happy path (mocked
    `fetch`), 4xx no-retry, 5xx single-retry, timeout, malformed JSON,
    over-long response truncation.
  - `src/lib/providers/vision/validate.test.ts` — banlist regex coverage,
    closed-set enforcement, A→C downgrade, demographic term rejection,
    hidden-fact rejection, empty input.
  - `src/lib/providers/vision/integration.test.ts` — wire
    `MapillaryImageryProvider` with a `MockVisionCaptioner` end-to-end;
    assert count card + caption cards co-exist; assert captioner failure
    yields the original count-only output (fail-soft).
  - `src/lib/providers/real.test.ts` — extend existing tests: with
    `visionCaptioner: undefined`, behavior unchanged (regression guard).

*Edits (existing):*
- `src/lib/providers/real.ts:224-286` — `MapillaryImageryProvider`:
  - Constructor: `constructor(private token: string, private vision?: VisionCaptioner)`.
  - In `street()`, after computing `n > 0`, ALSO fetch `id,thumb_1024_url`
    fields (currently only `id`); if `this.vision`, call
    `await this.vision.caption({ frameUrls, frameIds, address, lng, lat })`
    inside a `try/catch` and append the returned cards to the result.
    Catch swallows the error (one `console.warn` with a stable code,
    e.g. `vision_caption_failed`) and returns the count-only card array.
- `src/lib/providers/index.ts:46-51` — `getImageryProvider()`:
  - Resolve `vision = getVisionCaptioner()` (may be null).
  - When the Mapillary branch is taken, pass `vision` into the constructor.
- `src/lib/core/config.ts:30-110` — add to the `config` literal:
  - `visionProvider: env("FORLEADS_VISION") ?? (production && env("GEMINI_API_KEY") ? "gemini" : "off") as "gemini" | "mock" | "off"`.
  - `geminiKey: env("GEMINI_API_KEY")`.
  - `visionModel: env("FORLEADS_VISION_MODEL") ?? "gemini-2.5-flash"`.
  - Helper: `export function visionLive(): boolean { return config.visionProvider === "gemini" && Boolean(config.geminiKey); }`.
  - `coreLiveModeViolations()` (currently `:96-105`): DO NOT add vision as a
    required-live axis. Vision is opt-in; absence is not a violation.
- `src/lib/agents/scouts.ts:88-102` — no signature change required;
  optionally update the `gaps` heuristic so "Limited imagery coverage" still
  fires only when zero caption cards land AND the count card is grade-D.

**Steps:**
1. **Types + config flag** (no behavior yet): add `VisionCaptioner` interface
   + `VisionInput`; add `visionProvider`/`geminiKey`/`visionModel` to
   `config.ts`; export `visionLive()`. Compile only; no callers wired.
2. **Mock captioner** + first test. Deterministic, address-seeded output;
   `mode:"mock"`. Useful for tests + dev with no key.
3. **Validator** (`validate.ts`) + exhaustive unit tests for banlist /
   closed-set / A→C downgrade / demographic rejection / hidden-fact
   rejection. The validator is the policy surface; cover it before wiring.
4. **Prompt** (`prompt.ts`) — system block enforcing visible-only,
   no-hidden-fact, no-demographic rules; strict JSON output schema.
5. **Gemini adapter** (`gemini.ts`) — timeout, retry, JSON parse, validator
   call, error mapping. Unit tests with `fetch` mocked.
6. **Wire factory** (`vision/index.ts`) — `getVisionCaptioner()` returns
   gemini/mock/null based on flag.
7. **Inject into Mapillary provider** (`real.ts`) — constructor arg,
   `try/catch` around `vision.caption()`, append cards to the existing
   array. Fail-soft path covered by integration test.
8. **Factory wiring** (`providers/index.ts`) — pass captioner into
   `MapillaryImageryProvider`. Default path (no key) ⇒ `vision=null` ⇒
   behavior identical to today.
9. **Integration test** — `runImagery` end-to-end with mock captioner;
   assert co-existence + fail-soft + cache still works
   (`runScoutCached` should cache the merged result keyed by address).
10. **Trace events** via `src/lib/agents/trace.ts`: `vision.caption.attempt`,
    `vision.caption.ok` (with frame count + claim count + ms),
    `vision.caption.failed` (with stable error code, no PII). Do NOT log
    the frame URLs.
11. **Verification**: `npm run typecheck && npm run lint && npm test`;
    targeted `npm test -- src/lib/providers/vision`; then a single live
    Gemini call via a server-only script (`scripts/vision-probe.ts`) on a
    known address, recorded in the PR body. No prod env flip until
    security-reviewer signs off on the prompt + validator.

**Acceptance scenarios:**
- *Flag off (default):* `FORLEADS_VISION` unset, `GEMINI_API_KEY` unset →
  imagery output byte-identical to current (just the count card or
  grade-D gap). Zero Gemini calls. Regression test enforces this.
- *Flag on, happy path:* `FORLEADS_VISION=gemini`, key set, Mapillary
  returns 3 frames → Gemini returns 3 captions, all pass validator →
  `runImagery` returns 1 count card + 3 caption cards, each with
  `confidence ≤ "B"`, each citing both Mapillary frame url + Gemini model
  id in `sources[]`.
- *Gemini timeout:* network stalls past 8s → no card added, count card
  still returned, `vision.caption.failed` traced with code `timeout`,
  no exception propagates to the dispatcher.
- *Gemini 4xx (bad key):* 401/403 response → no retry, no card,
  `vision.caption.failed{code:"auth"}` traced; subsequent calls on
  different addresses keep trying (key may have been fixed).
- *Gemini 5xx:* one retry, then give up; fail-soft.
- *Malformed JSON:* validator returns `[]`; fail-soft; trace
  `validate.rejected{reason:"shape"}`.
- *Hidden-fact assertion:* Gemini returns `{claim:"condition", value:"needs new roof"}`
  → banlist regex rejects it → that single card dropped, others kept; if
  all rejected, count card stands alone.
- *Demographic term:* Gemini returns a value containing a banned word →
  full card dropped, traced.
- *A-grade attempt:* Gemini returns `confidence:"A"` → validator forces
  `"C"` (vision is inference, never grade-A).
- *Cache hit:* second `runScoutCached` call on the same address within 6h
  returns cards from cache; `vision.caption.attempt` NOT traced
  (already covered by existing scout cache test pattern).
- *Mapillary returns 0 frames:* vision step skipped entirely (no frames to
  caption); existing grade-D coverage card returned.

**Break plan (adversarial):**
- Prompt-injection inside a frame URL or address (`"; ignore previous…"`):
  user input only enters the user prompt as a quoted string; system block
  is fixed and cached; validator output schema is strict JSON → injection
  cannot change behavior. Test with a malicious address.
- Gemini returns 200 with HTML (provider outage page) → JSON parse throws
  → validator returns `[]` → fail-soft.
- Gemini returns 50 captions in one response → cap at 4 in validator;
  extras dropped.
- Frame URL fetch refused by Mapillary (signed URL expired) → Gemini gets
  whatever it gets; if it returns an error code about inaccessible image,
  validator drops; fail-soft.
- Concurrent burst (10 simultaneous taps on different addresses) →
  per-call timeout bounds total time; no global lock; cache deduplicates
  repeats. Cost cap = `≤ 10 * 1 call * ~$0.0002`.
- Quota exhaustion (HTTP 429) → no retry, traced as `quota`, count card
  alone returned. Optional follow-up: open a chip to surface the spend.
- Demographic regression: add a test that injects "young white family
  visible" into the mock response and asserts the validator drops it.
- Tenant isolation: vision input contains only address + lat/lng; no
  per-tenant identifiers reach Gemini. Verified by inspecting the
  `userPrompt()` output in a test.

**Verification evidence:**
- Gates: `npm run typecheck && npm run lint && npm test` — all green.
- Targeted: `npm test -- src/lib/providers/vision` and
  `npm test -- src/lib/providers/real`.
- One live probe via `scripts/vision-probe.ts <address>` against a real
  Mapillary-covered address (e.g. an SF Market St address). Capture
  response in the PR body (redact key).
- Trace inspection: `vision.caption.ok` event present with non-zero card
  count; no `lat`/`lng` keys in any persisted trace payload.
- Cost probe: with flag off, the live probe produces zero outbound
  requests to `generativelanguage.googleapis.com` (verified via outgoing
  request log).

**Cost / context budget:**
- Build: ≤25k context tokens (this packet ~3k; impl ~7k; tests ~6k).
- Per-call paid: ~$0.0002 per frame at `gemini-2.5-flash` rates; capped at
  3 frames/call ⇒ ≤$0.001 per address. Cache TTL 6h via existing scout
  cache ⇒ repeat taps free.
- Per-request budget: 8s wall-clock, 1 retry only on 5xx.

**Risks / gotchas:**
- **No naked numbers:** every caption card MUST have non-empty `sources[]`
  and `confidence` field. Validator asserts this; type system already
  enforces presence.
- **Confidence inflation:** Gemini will happily say "A" for things it
  cannot possibly know at grade-A. Force downgrade to "C" in validator.
- **Live-AI seam pattern** (playbook): mirror the `*Best()` shape used in
  `src/lib/agents/claude.ts` — single server-only module, low token
  budget, cached system block, 1 retry + timeout, typed error, callers
  fall back on ANY throw.
- **Mapillary frame URLs may be signed and short-lived** — fetch
  `thumb_1024_url` at the moment of caption; do NOT persist the URL into
  any card `sources[]` entry that might be cached >1h. Use the frame `id`
  in `sources[].name` and the public Mapillary viewer URL as
  `sources[].url`.
- **PII surface in trace:** never log frame URLs, raw model text, or
  Gemini's per-token output. Log claim count + ms + error code only.
- **Coordination with WS-H (listing copy):** WS-H Composer will consume
  these new EvidenceCards. If WS-H ships first, its tests must not assume
  the absence of caption cards; if WS-K ships first, listing copy quality
  improves automatically.
- **Tenant isolation:** AGENTS.md invariant. Vision input carries no
  tenant id; the provider is stateless. Confirmed by reading the
  `VisionInput` shape.
- **In-memory cache caveat** (playbook gotchas): scout cache is in-process
  and resets on serverless cold start. Vision calls may re-fire after a
  cold boot; documented but acceptable for v1.
- **Fail-soft, not fail-loud:** the playbook is explicit — on ANY throw,
  produce the count-only output; never propagate the exception. Tested.

**Human-in-the-loop:**
- *Secret:* `GEMINI_API_KEY` — provisioned via Google AI Studio
  (https://aistudio.google.com/apikey). Add to Vercel `production` env;
  do not paste into chat (per memory rule "credentials prompting loop").
- *Decision:* default model — start with `gemini-2.5-flash` (cheapest +
  multimodal). Confirm before merge.
- *Decision:* the closed-set claim allowlist (`style`, `condition`,
  `stories`, `materials`, `roof`, `landscaping`). Add/remove items
  before locking the validator.
- *Approval:* security/compliance reviewer pass on the prompt + banlist
  + demographic-term list before prod env flip.
- *Approval:* spend cap acknowledged (≤$0.001 per uncached lead tap).

**Dependencies on other workstreams:** none hard.
- *Indirect:* WS-H (listing copy / UC-8) will benefit immediately and may
  add tests that assume caption cards exist when the flag is on; coordinate
  test fixtures.
- *Indirect:* WS-G (drive-by farming) currently forbids the `imagery`
  scout in ambient mode (zero paid spend). WS-K does NOT change that — the
  `paidCallsAllowed=false` flag should also short-circuit vision. Add a
  small guard in `getVisionCaptioner()` or thread the flag into
  `VisionInput` so ambient drives stay $0.

**Estimated hours (solo-founder pace):** **4–6 hours**
- 0.5h types + config flag, 0.5h mock captioner, 1h validator + tests
  (densest test surface), 0.5h prompt, 1h gemini adapter + tests,
  0.5h Mapillary wiring + integration test, 0.5h trace + probe script,
  0.5h Playwright + PR video + PR body, 0.5h security-reviewer round-trip.

**Done criteria:**
- [ ] `VisionCaptioner` interface + `gemini`/`mock`/`null` factory landed.
- [ ] `FORLEADS_VISION` flag gates all live behavior; default (unset) is a
      byte-identical regression of today.
- [ ] `MapillaryImageryProvider` accepts an optional captioner and never
      throws on captioner failure (fail-soft test green).
- [ ] Validator enforces: closed-set claims, A→C downgrade, hidden-fact
      ban, demographic-term ban, strict JSON shape. Regression tests for
      each rule.
- [ ] Every emitted caption card has non-empty `sources[]` and
      `confidence ≤ "B"`; type system + runtime test both enforce.
- [ ] Trace events emit no PII (no lat/lng, no frame URLs, no raw model
      text); test asserts payload keys.
- [ ] Ambient drives (WS-G) consume zero Gemini calls; tested.
- [ ] Live probe documented in PR body; one cached + one uncached call
      shown in trace.
- [ ] Security/compliance reviewer signs off on prompt + banlists before
      `FORLEADS_VISION=gemini` is set in production.
- [ ] Playwright video attached to PR per memory rule "Video in PR required."
