# Plan: Live Claude reasoning (drafts + situation reading)

**Goal:** When `FORLEADS_AGENT_MODE=live` + `ANTHROPIC_API_KEY` is set, the
composer writes drafts and the notes classifier reads situations using real
Claude — grounded ONLY in evidence — with the deterministic templates as
fallback on any error. Mock mode unchanged.

**Why / value:** The drafts are what the agent/partner actually sees. Real Claude
turns scripted templates into genuinely personalized, on-brand outreach → higher
reply rates. Keep facts grounded (scouts/providers), so this adds intelligence
without violating "no naked numbers".

**Context links:**
- Brain seam: `src/lib/core/config.ts` → `claudeLive()`, `config.claudeModel`, `config.anthropicKey`.
- Composer (sync templates today): `src/lib/agents/composer.ts` → `compose()`.
- Notes classifier: `src/lib/agents/notes.ts`.
- Call site: `src/lib/pipeline.ts` (`draftArtifact`) → `src/app/api/draft/route.ts`.
- Compliance gate stays AFTER compose: `src/lib/agents/compliance.ts` (fail-closed; do not bypass).
- API reference: read the `claude-api` skill BEFORE writing any Anthropic code (model ids, SDK, prompt caching, tool/JSON output).

**Seams & exact files:**
1. New `src/lib/agents/claude.ts` — the ONE Anthropic client. Exposes
   `claudeJSON<T>({system, user, maxTokens, schemaHint})` returning parsed JSON,
   with: model from `config.claudeModel`, `anthropic-version` pinned, **prompt
   caching** on the static system block, low `max_tokens`, timeout + 1 retry,
   and a typed error so callers can fall back. Server-only.
2. `composer.ts` — add `async composeLive(input): Promise<ComposeOutput>` that
   calls `claudeJSON` to produce `{subject, body}` from brand voice + grounded
   evidence (pass only `confidence !== 'D'` cards; instruct: cite nothing it
   can't see; never reference protected classes). Keep `applyExclusions` +
   compliance AFTER. Export a single `composeBest()` that picks live vs template
   via `claudeLive()` and falls back on throw.
3. `notes.ts` — same pattern for situation classification (live → fallback to the
   current deterministic classifier).
4. Wire `pipeline.ts`/route to `await composeBest(...)`.

**Steps:**
1. `npm i @anthropic-ai/sdk --legacy-peer-deps`.
2. Read `claude-api` skill → confirm model id (`claude-opus-4-8`; consider a
   cheaper default like Haiku/Sonnet for drafts to hold cost ≈ $0 — make it
   `config.claudeModel`, default to the cost-effective one) + caching syntax.
3. Build `claude.ts` (client + `claudeJSON`).
4. Add `composeLive` + `composeBest`; make `compose()` the fallback path.
5. Mirror for `notes.ts`.
6. Update `pipeline.ts` call site to async best-path.
7. Keep all existing tests green; add a unit test that `composeBest` falls back
   to templates when the client throws (mock the client).

**Verification:**
- Gates: `npm run typecheck` · `lint` · `test` all pass.
- Mock path unchanged (no key) → templates still used; 38 tests green.
- Live path: set `ANTHROPIC_API_KEY` + `FORLEADS_AGENT_MODE=live` locally, run
  `npm run dev`, drop a note on a lead, confirm the drafted email is Claude-written
  and still passes the compliance linter. Cheap probe: a tiny script calling
  `claudeJSON` with a 1-line prompt to confirm auth + parsing before wiring UI.

**Risks / gotchas:**
- `claudeLive()` must gate everything — never call the API in mock mode (cost + tests).
- Fallback MUST be total: any throw/timeout → deterministic template, never a broken draft.
- Compliance stays fail-closed AFTER compose; Claude output is not trusted to be compliant.
- Hold cost: low `max_tokens`, prompt-cache the static system, cheap model default.
- `.npmrc` legacy-peer-deps already set → install will work on Vercel.

**Human-in-the-loop (needed to test live, not to build):**
- Solomon adds in Vercel env: `ANTHROPIC_API_KEY=<console.anthropic.com → API keys>`
  and `FORLEADS_AGENT_MODE=live`. (Building + the fallback path need no key.)

**Done criteria:**
- [ ] No-key mock mode identical to today; all gates green.
- [ ] With key, drafts are Claude-written, grounded, compliance-passing.
- [ ] Any client failure silently falls back to templates (tested).
- [ ] `playbook.md` gotchas updated with anything learned; this file checked off.
