# Plan: WS-C · Market scout + comps scoring

> Model-agnostic. Everything a model needs is here — don't rely on the model
> "being smart." If a step needs intelligence, specify it.

**Goal:** Upgrade the `market` scout from a grade-D gap card to a list of
graded comparable parcels (recency × proximity × size-similarity), each
returned as a cited `EvidenceCard`, so that downsizer outreach (UC-2) and
listing copy (UC-8) can quote real "$X within Y meters in the last Z months"
facts that pass compliance — never naked numbers.

**Why / value:** UC-2 (downsizer) and UC-8 (listing creation) both rely on
*cited* comps. Without them the Composer either fabricates value framing
(blocked by no-naked-numbers) or falls back to vague copy that won't convert
the Friday real-estate client. This is the highest-leverage scout to ship
after WS-A (the live property provider) because the same provider feed yields
both subject-property facts and the comp set.

**User / job:** Real-estate agent who has a likely downsizer (UC-2) or a
fresh listing (UC-8) and needs a defensible "what your home is worth in this
block" framing they can read aloud — confidence-graded and source-cited so
compliance never strips it from the draft.

**Pain evidence:**
- `src/lib/providers/mock.ts:171` returns a grade-D placeholder, and
  `src/lib/providers/real.ts:194` does the same for live OSM (line 203:
  "OSM carries no sale-price data"). Today the Composer cannot quote a single
  comp; UC-2 and UC-8 drafts are generic.
- `docs/Forleads_UserCases_v1.md:16` literally says "Market Scout assembles
  single-story / smaller comps nearby (graded)" — the product copy promises
  it; the code returns a gap.
- `src/lib/agents/scouts.ts:111` already treats an all-D comps list as
  `insufficient_evidence` and the pipeline routes around it — so the seam is
  ready; the scoring is missing.

**Current → desired behavior:**
- Before: `runMarket()` → ScoutResult with one grade-D card, status
  `insufficient_evidence`, Composer cannot quote a comp.
- After (WS-A live + WS-C scoring): `runMarket()` → 3–8 cited EvidenceCards
  describing individual comparable parcels graded A/B/C by a deterministic
  scoring function over recency, proximity (haversine meters), and
  size-similarity (living-area ratio). Composer can quote `"comparable at
  124 Elm sold $612k in Mar 2026, 180m away, confidence B"`. When the
  provider returns no comps OR every comp is grade D, we still return the
  honest gap card (status stays `insufficient_evidence`).

**Non-goals:**
- Not building the live data adapter — that is WS-A. WS-C consumes whatever
  comp rows WS-A returns via `PropertyDataProvider.comps()` and adds the
  scoring + grading layer.
- No AVM / regression model. This is *deterministic* scoring of comps the
  provider already returned; no inference of price for the subject.
- No UI work. The lead-rail / map cards already render EvidenceCards via the
  existing reducer + composer paths.
- No new CRM sync, no new connector, no outbound send.
- Does not change the dispatcher's market allowlist beyond what WS-A adds.

**Risk tier:** **medium**. No new auth, no new connector writes, no PII, no
migration. It touches a scout boundary that the Composer reads from, but the
scout already supports the "insufficient_evidence" fallback, so worst case
the surface degrades to today's behavior. Upgrade to **high** only if WS-A
chooses a paid provider and this PR is the one that flips the switch.

**Context links:**
- `AGENTS.md` — invariants (map-first, no naked numbers, graceful degradation).
- `docs/Forleads_Vision_v1.md` — graded evidence stance.
- `docs/Forleads_UserCases_v1.md:13` (UC-2), `:49` (UC-8).
- `docs/Forleads_AgentLoops_v1.md` §1–§3 — scouts/dispatcher contract.
- `docs/Forleads_MapGIS_v1.md` — H3 cell semantics for comp area key.
- `.agent/playbook.md` — seam pattern, no-naked-numbers, cache-correctness
  by scout type (`scouts.ts:218` already keys `market` by H3 — good).
- `src/lib/providers/types.ts:30` — `PropertyDataProvider.comps()` seam (no
  new interface needed; we add a richer return shape under the same method).
- `src/lib/agents/scouts.ts:104` — `runMarket()` call site.
- `src/lib/providers/mock.ts:171` — current grade-D mock comps return.
- `src/lib/providers/real.ts:194` — current grade-D live comps return.
- `src/lib/agents/dispatcher.ts:28` — `market` allowlist (`MLS`, `ATTOM`,
  `OSM`); WS-A may extend.

**Seams & exact files:**
- Reuse the existing seam `PropertyDataProvider.comps(q: PropertyQuery)` at
  `src/lib/providers/types.ts:37`. **No new interface.** The richer comp
  payload travels inside the existing `EvidenceCard[]` return — one card
  per comp, plus optionally one grade-D summary card if `<3` comps survive.
- New module: `src/lib/agents/comps-scoring.ts` — pure, deterministic
  scoring + grading. Takes raw comp rows (lng/lat/sold_price/sold_at/
  living_area/source) + subject (lng/lat/living_area?) → ordered
  `EvidenceCard[]` with A/B/C grade. No I/O, no provider calls.
- Update `src/lib/agents/scouts.ts:104` (`runMarket`) to call
  `getPropertyProvider().comps()` and, when ≥1 non-D card returns, leave it
  as-is; when 0 non-D cards return, keep the existing gap behavior.
- Update `src/lib/providers/mock.ts:171` (`MockPropertyProvider.comps`) to
  generate 4–8 seeded synthetic comp rows around `q.lng/q.lat` and route
  them through `scoreComps()` so the mock path returns graded comps end-to-end
  (gives a deterministic green path for tests + dev).
- `src/lib/providers/real.ts:194` (`RealPropertyProvider.comps`) keeps its
  honest grade-D return *until WS-A lands* — this plan does NOT change live
  behavior; it only readies the scoring layer that WS-A will plug into.
- Tests: `src/lib/agents/comps-scoring.test.ts` (unit), and extend
  `src/lib/agents/scouts.cache.test.ts` only if needed (H3 cache key for
  `market` is already correct).

**Steps:**
1. Define `RawComp` and `ScoredComp` types inside
   `src/lib/agents/comps-scoring.ts` (lng, lat, sold_price, sold_at ISO,
   living_area_sqm?, source name+url?). Pure module, no React/Next imports.
2. Implement `haversineMeters(a, b)` (pure) and a recency-decay function
   `recencyWeight(soldAt, now, halfLifeDays = 365)`.
3. Implement `sizeSimilarity(subject, comp)` returning `1` when subject area
   is unknown (degrades gracefully — invariant: no penalty for missing
   subject area, just lower confidence on the resulting grade).
4. Implement `scoreComp({radiusM, maxAgeDays}, subject, comp)` → a 0..1
   score = `0.5*proximity + 0.3*recency + 0.2*sizeSim`. Reject comps outside
   `radiusM` (default 1500m) or older than `maxAgeDays` (default 540).
5. Implement `gradeFromScore(score, sources)`:
   `A ≥ 0.8 && sources.length ≥ 1`, `B ≥ 0.55`, `C ≥ 0.3`, else dropped.
   Cards with no source must NOT receive grades A/B (invariant: no naked
   numbers; ungraded value forbidden).
6. Implement `scoreComps(subject, raw[], opts?)` → return EvidenceCards
   sorted by score desc, capped at 8, each with `claim` =
   `"Comparable sale at <addr or H3>"`, `value` =
   `"<currency> at <distance>m, sold <relative time>"`, `sources` carrying
   the provider name + listing URL, `reasoning` = the score breakdown
   string. When the survivor count is `<3`, append a single grade-D
   summary card explaining "Only N comps within radius/age window".
7. Wire `MockPropertyProvider.comps` to a seeded comp generator (use the
   same `seeded(q.address)` PRNG already in mock.ts) → call `scoreComps()`
   and return the result. This gives the mock pipeline real graded output.
8. Add `src/lib/agents/comps-scoring.test.ts`:
   (a) happy path returns ≥3 cards A/B/C ordered by score,
   (b) all comps beyond radius → empty + grade-D summary,
   (c) missing `sold_at` → comp rejected (no naked number),
   (d) no source → comp can only land at grade C or be dropped,
   (e) deterministic ordering for the same input (snapshot a hash).
9. Run `npm run typecheck` · `npm run lint` · `npm test`. Confirm the
   existing `scouts.cache.test.ts` still passes — the H3 cache key is the
   right granularity for area-level comps and must not be downgraded to
   per-address.
10. Update `.agent/playbook.md` only if a new gotcha is discovered.

**Acceptance scenarios:**
- *Happy (mock):* a lead in the mock seed surface yields a `market`
  ScoutResult with ≥3 EvidenceCards (no grade-D), each carrying a non-empty
  `sources[]`, sorted by score desc, status `ok`.
- *Empty / no comps in window:* provider returns `[]` (or all comps
  exceed radius/age) → exactly one grade-D summary card with `value: null`,
  status `insufficient_evidence`, gap text mentions radius + window.
- *Failure (provider throws):* `withBudget()` at `scouts.ts:75` catches via
  the existing budget race; status is `budget_exceeded` or
  `insufficient_evidence`, never crashes the dispatcher.
- *Recovery:* on the next run with the same H3 cell, the cache at
  `scouts.ts:236` returns the prior `ok` result with `cost.cacheHit=true`,
  no provider call.
- *Allowlist enforcement:* a comp whose source name is not in
  `dispatcher.ts:28`'s `market` allowlist is filtered by
  `scouts.ts:182` and counted as `rejected`. WS-A must add its provider
  string to the allowlist when it lands.
- *Compliance:* Composer can quote a comp card and the compliance lint
  (`src/lib/agents/compliance.ts`) does NOT strip it — proven by an
  end-to-end pipeline test that asserts the draft contains the comp's
  address or price token.

**Break plan:**
- *Malformed comp row:* `sold_at` not parseable → `scoreComp` returns
  `null`, the card is dropped, no NaN propagation. Test asserts.
- *Identical lat/lng (provider bug):* haversine = 0 → score caps at 1.0,
  cards are still ordered by recency tiebreaker. Test asserts no Infinity.
- *Huge result set (provider returns 10k rows):* `scoreComps` caps at 8
  AFTER scoring; memory bounded. Test with a 5k input.
- *Stale H3 cache:* if WS-A flips a provider, the existing 6h TTL at
  `scouts.ts:208` is acceptable; we don't shorten it in this PR.
- *Cross-tenant bleed:* `market` cache key is H3 cell, not agent_id — this
  is intentional (area facts are public). Confirm no agent-private signal
  leaks into the comp `reasoning` string (e.g., no lead id).

**Verification evidence:**
- `npm run typecheck && npm run lint && npm test` green.
- `npm run agent:check -- --risk=medium` green.
- `npm run dev` + a curl/Playwright pass that drops a pin in the mock
  surface and confirms the `market` scout panel renders ≥3 graded comps.
- `grep -n "value: null" src/lib/agents/comps-scoring.ts` returns ONLY the
  grade-D summary path — no other null prices.

**Cost / context budget:**
- Phase: medium-tier PR — scoring module + tests + mock wiring. ≤ 6 files
  touched. No paid AI calls. Provider call count unchanged from today (1
  per scout invocation).
- Context sources: this packet, the 6 files in "Seams & exact files",
  the playbook gotchas table. Do NOT re-read all of `src/lib/agents/`.

**Risks / gotchas:**
- `.agent/playbook.md` — "no naked numbers" applies: any `value` rendered
  must carry sources. `scoreComps` enforces this at the grade boundary.
- `.agent/playbook.md` — "Live AI = one seam + total fallback" applies: if
  WS-A's live provider throws, the existing `withBudget()` + grade-D summary
  is the fallback. Never let the model fabricate a comp.
- `scouts.ts:218` already keys `market` by H3 — do not "improve" it to
  per-address; the cache would explode and area comps don't change per
  building.
- New gotcha to watch: if the provider returns `sold_price` in different
  currencies, the score is unit-agnostic but the `value` string would be
  misleading. WS-A must normalize or pass `currency_code` per row.

**Human-in-the-loop:**
- No secrets, no approvals, no external sends. PR review only. WS-A may
  require a provider key — that is its packet, not this one.

**Done criteria:**
- [ ] `src/lib/agents/comps-scoring.ts` exists, pure, no I/O imports.
- [ ] `src/lib/agents/comps-scoring.test.ts` covers the 5 cases in step 8.
- [ ] `MockPropertyProvider.comps` returns graded EvidenceCards, ≥3 in the
      seeded happy path, no grade-D when ≥3 survive.
- [ ] `RealPropertyProvider.comps` is unchanged (waits for WS-A).
- [ ] `runMarket()` returns status `ok` for the mock happy path; existing
      `scouts.cache.test.ts` still green.
- [ ] `npm run typecheck && npm run lint && npm test` green.
- [ ] PR body includes a Playwright video of a lead's market panel rendering
      the graded comps (per memory: "Video in PR required" P1).
- [ ] PR body includes 3–6 SPECIFIC feedback questions (per memory:
      "Feedback before merge" P2).

**Dependencies:**
- **WS-A · Live property/owner data adapter** — MUST provide a working
  `PropertyDataProvider.comps()` that returns raw comp rows (lng, lat,
  sold_price, sold_at, optional living_area, source name+url) for at least
  one market. Until WS-A lands, only the mock path returns graded comps;
  live continues to return the grade-D summary. WS-A must also add its
  provider's name string to `dispatcher.ts:28`'s `market` allowlist.

**Estimated hours:** 6 hours (solo-founder pace).
- 1h scoring module + types
- 2h unit tests (5 cases + determinism)
- 1h mock seeded comp generator wiring
- 1h end-to-end happy-path through Composer + compliance check
- 1h PR write-up + Playwright video
