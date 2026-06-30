# Plan: WS-A — Live property/owner data adapter

> Model-agnostic. Everything a model needs is here — don't rely on the model
> "being smart." If a step needs intelligence, specify it.

**Goal:** Behind the existing `PropertyDataProvider` seam, ship a licensed
property+owner adapter (ATTOM as primary recommendation) that returns cited,
graded `EvidenceCard`s for `facts()` and `comps()` in the US farm market —
upgrading the canonical "knock + drafted follow-up" loop from a D-grade OSM
floor to A/B-grade owner/structure/comps facts — gated by a per-tenant/day
cost cap and an H3+address cache so a real client can run it Friday.

**Why / value:** UC-1 (Knocked, no answer) and UC-2 (Likely downsizer) cannot
draft a credible, *cited* follow-up without owner name, year built, lot/beds,
and at least one comp. UC-3 (drive-by farming) ranks streets by tenure and
land-use signals that OSM does not carry. UC-7/UC-8 (vision + listing copy)
need grounded structure facts to caption against. With OSM-only the live
production demo to the Friday client returns mostly D-grade gap cards —
trust moat (`docs/Forleads_Vision_v1.md` §6.2 "Grounded is the moat") fails
on first real lookup.

**User / job:** A licensed real-estate agent in the demo US metro who taps an
address on the map expects the scout swarm to surface a *cited* owner, year
built, lot size, and at least one nearby sold comp — A or B confidence —
within 8 seconds, without burning the day's budget.

**Pain evidence:**
- `src/lib/providers/real.ts:194-206` — `OSMPropertyProvider.comps()` hard-codes
  a grade-D gap ("OSM carries no sale-price data") for every lookup.
- `src/lib/providers/real.ts:148-192` — `facts()` only emits `year_built` and
  `land_use` and only when OSM tags happen to exist; most US addresses miss
  one or both.
- `coreLiveModeViolations()` in `src/lib/core/config.ts:96-105` already lists
  `property` as a degraded axis when `propertyProvider === "osm-mock"` — there
  is no live tier above OSM yet.

**Current → desired behavior:**
- *Current:* tapping a US address → property scout emits 0–2 grade-A/C OSM
  cards + grade-D comps gap. No owner, no comps, no tenure.
- *Desired:* same tap → `AttomPropertyProvider.facts()` returns cards for
  *owner name*, *year built*, *beds/baths*, *lot size*, *land use*, *last sale*,
  each cited to ATTOM, confidence A or B; `comps()` returns 3–5 recent
  arms-length sold comps within 0.5mi/12mo, each a cited card. Cache hit on
  repeat tap of the same H3 r9 cell within 24h. Daily spend per tenant capped;
  on cap, provider returns a single grade-D `quota_exhausted` card and the
  swarm degrades to OSM transparently.

**Non-goals:**
- Non-US markets (ATTOM is US-only; EU/UK adapters are a later WS).
- MLS/IDX feeds — those need broker membership and are out of MVP.
- Persisting owner PII to Supabase as a long-lived record. Owner name is
  surfaced in the EvidenceCard only; storage rules belong to WS-M.
- Writing comps to the spatial-memory RAG (separate WS).
- People-scout enrichment (skip-trace, phones) — explicitly out; would change
  the compliance posture.

**Risk tier:** **high.** External paid provider, PII (owner names) leaving the
provider, per-tenant spend, fair-housing surface (any owner-attribute could
become targeting if misused). Per AGENTS.md §risk tiers: external providers +
expensive operations + privacy = high. Requires coverage, build, adversarial
tests, rollback notes, and a security-reviewer pass.

**Context links:**
- `docs/Forleads_Vision_v1.md` §6 (grounding moat), §9 (data-adapter
  passthrough business model — *user brings their key*).
- `docs/Forleads_UserCases_v1.md` UC-1, UC-2, UC-3, UC-7, UC-8.
- `src/lib/providers/types.ts:30-38` — the `PropertyDataProvider` seam already
  exists; no contract change required.
- `src/lib/providers/index.ts:40-44` — factory branch where new providers
  plug in (`config.propertyProvider === "attom"`).
- `src/lib/core/config.ts:45` — `FORLEADS_PROPERTY_PROVIDER` env wire-up.
- `src/lib/core/config.ts:96-105` — `coreLiveModeViolations()` to update so
  `osm` (no owner/comps) registers as a degraded property tier in prod.
- `src/lib/cache/index.ts:16-54` — `CacheStore` seam for the H3+address cache;
  honor the "in-memory = per-warm-instance" caveat.
- `.agent/playbook.md` — "Seam pattern", "No naked numbers", "Live AI = one
  seam + total fallback", OSM UA gotcha (already solved, do not re-fix).

**Seams & exact files:**

*Edits (existing):*
- `src/lib/providers/real.ts` — add `AttomPropertyProvider` class
  implementing `PropertyDataProvider`; reuse the EvidenceCard gap helper
  pattern from `OSMPropertyProvider`.
- `src/lib/providers/index.ts:40-44` — add `if (config.propertyProvider ===
  "attom") return new AttomPropertyProvider({ apiKey, cache, cap, fallback:
  new OSMPropertyProvider() })`. The OSM provider is the always-on safety
  net per "Live AI = one seam + total fallback" playbook rule.
- `src/lib/core/config.ts:45` — accept `"attom"` as a valid value; add
  `attom: { apiKey: env("ATTOM_API_KEY"), dailyCapUsd: Number(env("ATTOM_DAILY_CAP_USD") ?? "5"), cacheTtlHours: Number(env("ATTOM_CACHE_TTL_H") ?? "24") }`.
- `src/lib/core/config.ts:96-105` — `coreLiveModeViolations()` should flag
  `propertyProvider === "osm"` as a *degraded* (not violating) tier in prod
  once `ATTOM_API_KEY` is set — keeps the audit ledger honest.

*New files:*
- `src/lib/providers/attom.ts` — adapter implementation (HTTP client,
  field mapping, EvidenceCard shaping, cited sources, confidence grading).
- `src/lib/providers/attom.test.ts` — unit tests with mocked `fetch` for
  happy / 401 / 429 / empty-coverage / quota-exhausted / malformed-JSON.
- `src/lib/providers/budget.ts` — small per-tenant per-day spend counter
  with `CacheStore` backing (key = `attom:spend:<agentId>:<yyyy-mm-dd>`).
- `src/lib/providers/budget.test.ts` — cap-hit, cap-reset-at-midnight,
  multi-tenant isolation.
- `.agent/decisions/ws-a-provider-choice.md` — one-page rationale (ATTOM vs
  Estated vs Regrid vs Datafiniti) referencing pricing + coverage as of
  2026-06-30.

*Optional (only if decided):*
- `supabase/migrations/0009_property_cache.sql` — durable cache table keyed
  by `(h3_r9, normalized_address)` IF we choose to upgrade the cache from
  warm-instance to durable in the same PR. Otherwise punt to WS-M.

**Steps:**
1. **Pick provider** (1 file write, no code): produce
   `.agent/decisions/ws-a-provider-choice.md` comparing ATTOM (broad US
   coverage, owner+structure+sale, ~$0.02–0.05/lookup), Estated (similar,
   simpler pricing), Regrid (parcel polygons + owner, no sale comps),
   Datafiniti (broader but uneven quality). Default pick: **ATTOM** for
   facts+comps coverage. **OPEN DECISION** — confirm with user before key
   purchase.
2. **Stub the seam** end-to-end: add `"attom"` config branch + factory wire
   without real HTTP — return all grade-D `provider_not_configured` cards.
   Verify the type signature and that `coreLiveModeViolations()` reads
   correctly. No paid call yet.
3. **Build budget guard** (`budget.ts`): `tryConsume(agentId, costUsd)`
   returns `{ ok, remainingUsd }`. Default cap `$5/tenant/day`. Backed by
   `CacheStore`; falls open to deny on cache error (fail-closed).
4. **Build cache key**: `propertyCacheKey(provider, h3_r9, normalizedAddress)`.
   Reuse `getCache()`. TTL from config (default 24h). Cards are JSON-safe.
5. **Implement `AttomPropertyProvider.facts()`**: call
   `https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/detail`
   with `address1` + `address2`; map response → EvidenceCards (owner=A,
   year_built=A, beds/baths=A, lot=A, land_use=A, last_sale=A,
   estimated_value=*never* surfaced as a fact — only as a graded estimate
   if at all, per Vision §7 anti-goal #1). Fail-closed: on `401`/`429`/
   network err, return OSM fallback and emit a trace event.
6. **Implement `comps()`**: call `/sale/snapshot` for 0.5mi / 12mo arms-length
   sold; cap at 5; each comp = one EvidenceCard with `sources:[ATTOM]`,
   confidence B (B not A because comp selection inherently noisy).
7. **Tracing + observability**: emit `provider.call`, `provider.cache_hit`,
   `provider.budget_exhausted`, `provider.fallback_used` via existing
   `src/lib/agents/trace.ts`. Required for adversarial verify.
8. **Tests**: happy/401/429/empty/quota/malformed (provider), cap/reset/
   isolation (budget), cache hit/miss/TTL (cache wiring).
9. **Live smoke probe**: a single `curl` against ATTOM staging with the
   issued key, before flipping prod env — per playbook "verify the risky
   layer cheaply."
10. **Flip behind env**: set `FORLEADS_PROPERTY_PROVIDER=attom` +
    `ATTOM_API_KEY` in Vercel *preview only* first; verify on a preview
    URL with a Playwright video (per memory rule "Video in PR required");
    then promote to prod after human approval.

**Acceptance scenarios:**
- *Happy (US covered address):* tap → ≥4 distinct A/B EvidenceCards
  (owner, year_built, lot, last_sale) within 8s, all citing ATTOM.
- *Cache hit:* second tap on the same H3 r9 within 24h returns the same
  cards from cache, no provider call, `provider.cache_hit` traced.
- *Out-of-coverage (e.g. rural lat/lng with no parcel):* returns a single
  grade-D gap card (`"No ATTOM record for this parcel"`), and OSM cards
  still flow through the fallback. No naked number anywhere.
- *Budget exhausted:* the day's 100th lookup returns a single grade-D
  `quota_exhausted` card, falls back to OSM provider, traces the event.
  Counter resets at next UTC midnight.
- *Provider 401:* returns OSM fallback cards + grade-D `provider_unavailable`
  card; emits `provider.fallback_used`. No crash, no leaked stack.
- *Tenant isolation:* tenant A burning the cap does not block tenant B
  (covered by `budget.test.ts`).

**Break plan (adversarial):**
- 200 with malformed JSON → catch, fallback, no throw to caller.
- ATTOM response carrying unexpectedly nested arrays → schema-validate the
  fields we actually use; ignore extras; never trust the upstream shape.
- 429 with `Retry-After` → respect once, then fallback. Do not retry-loop
  inside a request (UC-1 has an 8s budget end-to-end).
- Address normalization collisions ("123 Main St" vs "123 main street")
  → use a canonicalizer (lowercase + strip punctuation + collapse spaces)
  before cache key.
- Owner name contains PII edge cases (trusts, LLCs) → surface as-is, never
  derive demographic attributes from it (compliance invariant).
- Stale-cache: if a comp's `sale_date > cache_ttl`, force refetch even
  within TTL (sale data shifts; structure facts don't).

**Verification evidence:**
- Unit gates: `npm run typecheck && npm run lint && npm test` — all green.
- Targeted: `npm test -- src/lib/providers/attom.test.ts` and
  `src/lib/providers/budget.test.ts`.
- Live probe: `curl -H "apikey: $ATTOM_API_KEY" 'https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/detail?address1=586+Franklin+Ave&address2=Brooklyn+NY'`
  — expect 200 + a recognizable owner field.
- Preview URL: Playwright video showing tap → ≥4 cited cards in the right
  rail within 8s; second tap shows cache-hit trace in inspector.
- Cost: confirm `provider.call` count ≤ expected for the smoke run.

**Cost / context budget:**
- Build: ≤30k context tokens (this packet ~2k; impl ~6k; tests ~6k).
- Paid: ≤$1 of ATTOM during development (≈ 20–50 lookups against staging).
- Per-tenant prod cap: `$5/day` default — covers ≈ 100 detail lookups +
  ≈ 50 comps lookups. Configurable via `ATTOM_DAILY_CAP_USD`.

**Risks / gotchas:**
- Re-applies "OSM User-Agent" rule transitively — any new HTTP from the
  fallback path must keep the descriptive UA (playbook gotcha row 6).
- Cache backend is in-memory by default → cache hit-rate is per-warm
  serverless instance only. Cap math assumes hit-rate of 0 for budgeting
  to stay safe; honest "graded B not A" caveat per `src/lib/cache/index.ts:7-11`.
- Owner PII: never log full owner names at info level; use a hash in trace
  events; redact in error messages. Security-reviewer must sign off.
- Fair-housing: owner-attribute fields (name) MUST NOT feed any composer
  prompt about demographics. UC-12 linter is the backstop; provider keeps
  the contract simple by not exposing protected-class-adjacent fields even
  when ATTOM returns them.
- Do not double-charge: serialize the budget consume → provider call →
  cache write so a thrown error after `tryConsume` still records spend.

**Human-in-the-loop:**
- *Decision:* "Confirm ATTOM as the live property provider for the Friday
  US client (vs Estated/Regrid)?" — see decisions doc.
- *Secret:* `ATTOM_API_KEY` (Vercel env, preview + prod). User must add via
  `vercel env add` — never paste in chat (memory rule [P1]
  credentials-prompting-loop).
- *Approval:* security-reviewer pass on owner-PII handling before prod env
  promotion. Architect approval to bump `coreLiveModeViolations()` semantics.
- *Spend ceiling:* user picks `ATTOM_DAILY_CAP_USD` (default $5) before
  prod flip.

**Dependencies on other workstreams:**
- None blocking. WS-C (Market scout + comps scoring) will *consume* the
  comps cards this adapter emits; this packet must deliver comps in a
  shape WS-C's reducer can sort/grade. Coordinate the EvidenceCard
  `reasoning` field naming with WS-C before merge.
- WS-M (real-user production hardening) will eventually own the durable
  cache table; until then, in-memory is acceptable with the caveat above.

**Estimated hours (solo-founder pace):** **6–8 hours**
- 0.5h decisions doc, 0.5h key sign-up, 1h stub seam, 1h budget guard,
  2h adapter implementation + field mapping, 1.5h tests, 0.5h live probe
  + preview verification, 0.5h PR body + video.

**Done criteria:**
- [ ] `.agent/decisions/ws-a-provider-choice.md` written and accepted.
- [ ] `AttomPropertyProvider` implemented behind existing seam (no contract
      change to `PropertyDataProvider`).
- [ ] Per-tenant daily cost cap enforced, with isolation test green.
- [ ] H3 + normalized-address cache wired via `CacheStore`, TTL configurable.
- [ ] All adversarial scenarios above covered by tests.
- [ ] Live `curl` probe succeeded against ATTOM staging with the prod key.
- [ ] Preview deploy demo video attached to PR (per "Video in PR required").
- [ ] OSM fallback verified by killing the ATTOM key in preview and
      confirming the swarm still answers (graceful degradation invariant).
- [ ] `coreLiveModeViolations()` no longer flags `property` as a violation
      when `attom` is configured; `osm` becomes a *degraded* (not violating)
      tier — audit ledger remains honest.
- [ ] No owner PII present in any persisted Supabase row added by this PR.
