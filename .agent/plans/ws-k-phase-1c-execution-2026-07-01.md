# Plan: WS-K Phase 1c execution

> Execution supplement for `.agent/plans/ws-k.md`. This branch stays scoped to
> the off-by-default Gemini vision slice only.

**Goal:** Add a flag-gated Gemini vision caption seam to Mapillary imagery that
enriches evidence when enabled and disappears cleanly when disabled or failing.

**Why / value:** This upgrades imagery from a coverage check to grounded visual
evidence for listing copy and scout output without breaking the current product
floor.

**User / job:** An agent taps a property and receives visible-only exterior
facts with citations and bounded confidence, or the same count-only imagery
signal as today when the provider is unavailable.

**Pain evidence:** Live imagery currently returns only frame count; no Gemini
adapter exists; listing and composition lack visible-feature evidence.

**Current -> desired behavior:** Keep the default path unchanged, add a strict
validator and prompt for vision output, and inject the captioner only in the
live Mapillary branch when `FORLEADS_VISION=gemini` and a key is present.

**Non-goals:** No phone-photo upload, no hidden-fact inference, no UI rebuild,
no production flip, no persistence changes.

**Risk tier:** high. Paid provider, policy-sensitive output surface, and
graceful-degradation requirements.

**Context links:**
- `AGENTS.md`
- `.agent/handoffs/current.md`
- `.agent/decisions/phase-0-resolutions.md`
- `.agent/plans/ws-k.md`
- Google Gemini API docs on image understanding and structured output

**Seams & exact files:**
- `src/lib/core/config.ts`
- `src/lib/providers/index.ts`
- `src/lib/providers/real.ts`
- new `src/lib/providers/vision/*`
- imagery/provider tests

**Steps:**
1. Add config and vision interfaces with the default flag off.
2. Add prompt + validator before wiring any live calls.
3. Implement the Gemini adapter with bounded timeout, retry, and schema output.
4. Inject into Mapillary only, keeping fail-soft count-only behavior.
5. Add focused tests, then run high-risk gates and phase recording.

**Acceptance scenarios:** flag off regression, happy path captions, timeout,
4xx/5xx provider failure, hidden-fact rejection, demographic rejection,
cache-preserving behavior.

**Break plan:** malformed JSON, prompt-injection attempt in address text,
oversized caption array, inaccessible frame image, repeated address cache hit.

**Verification evidence:** targeted provider tests, repo gates, and
`npm run agent:check -- --risk=high`.

**Cost / context budget:** one packet, one worktree, zero production mutation,
and direct doc-backed API usage.

**Risks / gotchas:** allowlist must accept new imagery sources, vision output
must never surface hidden condition claims, and the default branch must remain
off even when `GEMINI_API_KEY` is present.

**Human-in-the-loop:** production flag flip and real API spend stay deferred.

**Done criteria:** validator enforced, live seam bounded, default path unchanged,
high-risk gate green, phase recorded.
