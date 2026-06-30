# Plan: WS-B · Live Risk Scout — FEMA NFHL flood-zone adapter (no-key)

> Model-agnostic. Everything a model needs is here — don't rely on the model
> "being smart." If a step needs intelligence, specify it.

**Goal:** Replace the always-grade-D `runRisk` stub
(`src/lib/agents/scouts.ts:121-144`) with a typed `RiskProvider` seam whose
default real adapter (`FemaNfhlRiskProvider`) queries the **FEMA National Flood
Hazard Layer (NFHL)** ArcGIS REST service and returns a grade-A `EvidenceCard`
citing NFHL when the point hits a flood-zone polygon, or a grade-D gap card
(also citing NFHL) when out of coverage / service down.

**Why / value:** UC-2 (likely-downsizer outreach) and UC-7 (snap-a-house
vision-grounded context) both lean on an honest hazard signal so the agent
neither (a) ships a "perfect investment" pitch on a Special Flood Hazard Area
without disclosure nor (b) ships a property card with an empty Risk row.
FEMA NFHL is free, US-wide, no key — cheapest credible move from D → A for
half the user base.

**User / job:** A US real-estate agent triaging a lead expects the Risk row of
the property card to say something cited (zone X, AE, VE, etc.) or to show an
honest, cited gap. Today it ALWAYS reads "No verified hazard provider is
configured" regardless of address.

**Pain evidence:**
- `src/lib/agents/scouts.ts:121-144` — `runRisk` ignores `input.lng/lat` and
  always returns the same grade-D card.
- Conflicts with [P1] product-stance memory: "honest empty states; silent API
  failures = bugs."
- UC-2 (`docs/Forleads_UserCases_v1.md:13`) and UC-7 (`:43`) both depend on
  property+risk context for the outreach the agent ships.

**Current → desired behavior:**
- Current: `runRisk(input)` → always one grade-D card,
  status `insufficient_evidence`, `calls: 0`.
- Desired: `runRisk(input)` → `getRiskProvider().flood({lng,lat,address})` →
  - In coverage + zone returned → ONE grade-A card
    `{ claim:"Flood zone", value:"<ZONE> — SFHA: <yes|no>", sources:[
    { name:"FEMA NFHL", url:"<layer query URL>" }], confidence:"A" }`,
    status `ok`, `calls: 1`.
  - Out of coverage (0 features) or non-200 / timeout → ONE grade-D card with
    a non-empty `reasoning` and the same NFHL source citation; status
    `insufficient_evidence`. (No silent throw — see `audit-unwrapped-awaits`
    memory.)

**Non-goals:**
- Wildfire / hurricane / earthquake hazards (separate adapters later).
- Non-US coverage (NFHL is US-only — international addresses must still get an
  honest grade-D with reasoning "NFHL is US-only").
- Insurance pricing / NFIP policy lookup.
- Migrating the Risk row UI; reuse existing `EvidenceCard` rendering.

**Risk tier:** **medium.** External live network call, no key/secret, no
persistence change, no auth boundary, no destructive mutation. Goes through the
existing seam pattern (playbook §1) and the existing `withBudget` wrapper
(`scouts.ts:31-57`). Cache-key behavior is unchanged — risk is already H3-keyed
(`scouts.ts:223-225`).

**Context links:**
- `AGENTS.md` (invariants: map-first, no naked numbers, graceful degradation).
- `docs/Forleads_Vision_v1.md` — global free floor, cited evidence.
- `docs/Forleads_UserCases_v1.md:13` (UC-2), `:43` (UC-7).
- `.agent/playbook.md` — "Seam pattern", "No naked numbers",
  "Live OSM Overpass `User-Agent` gotcha" (NFHL is hosted on Esri ArcGIS so
  UA is less strict but still set one), "audit-unwrapped-awaits" memory.
- `.agent/plans/ws-a.md` — sibling adapter; same seam style.
- FEMA NFHL service:
  `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query`
  (layer 28 = "Flood Hazard Zones"). GeoJSON via `f=geojson`,
  `geometryType=esriGeometryPoint`, `inSR=4326`, returnGeometry=false,
  outFields=`FLD_ZONE,ZONE_SUBTY,SFHA_TF`.

**Seams & exact files:**
- New seam in `src/lib/providers/types.ts` (append below existing interfaces):
  ```
  export interface RiskQuery { lng:number; lat:number; address:string; }
  export interface RiskProvider {
    readonly name: string;
    readonly mode: "mock" | "live";
    flood(q: RiskQuery): Promise<EvidenceCard[]>;
  }
  ```
- New real adapter in `src/lib/providers/real.ts` — class
  `FemaNfhlRiskProvider implements RiskProvider`. Pattern: copy
  `OSMPropertyProvider` (`real.ts:139-220`) including `User-Agent`, try/catch,
  cited grade-D gap on every failure path.
- New mock adapter in `src/lib/providers/mock.ts` — `MockRiskProvider` that
  returns a stable fake zone for deterministic tests (no network).
- Factory wiring in `src/lib/providers/index.ts` (after `getImageryProvider`):
  ```
  export function getRiskProvider(): RiskProvider {
    if (config.riskProvider === "fema-nfhl") return new FemaNfhlRiskProvider();
    return new MockRiskProvider();
  }
  ```
- Env switch in `src/lib/core/config.ts:45-49` — add
  `riskProvider: env("FORLEADS_RISK_PROVIDER") ?? (production ? "fema-nfhl" : "mock"),`
  and add `"risk"` to `coreLiveModeViolations()` (`config.ts:96-105`) so a
  prod deploy stuck on the mock fails the live-mode gate.
- Wire into `runRisk` at `src/lib/agents/scouts.ts:121-144`: model the body on
  `runProperty` (`scouts.ts:72-86`) — call `getRiskProvider().flood(q)` inside
  `withBudget(input.job.budget.maxMs, [], …)`, stamp cards, return
  `status: timedOut ? "budget_exceeded" : cards.some(A) ? "ok" : "insufficient_evidence"`.
  Use `.catch(fallback)` per the vitest gotcha (`playbook.md` row 8) rather
  than `try/await`.
- Allowlist: confirm `input.job.allowlist` for risk includes `"FEMA"` /
  `"NFHL"` so the filter at `scouts.ts:182-188` doesn't strip the new card.
  If the existing allowlist for the risk scout (search `allowlist` under
  `src/lib/agents/dispatcher.ts` + `src/lib/core/types.ts`) does not list
  FEMA/NFHL, extend it there as part of this PR.

**Steps:**
1. Add `RiskProvider` + `RiskQuery` to `src/lib/providers/types.ts`.
2. Add `MockRiskProvider` to `src/lib/providers/mock.ts` (deterministic
   zone-AE-ish card for one fixture lng/lat, grade-D for everything else).
3. Add `FemaNfhlRiskProvider` to `src/lib/providers/real.ts` with UA header,
   8s soft fetch timeout (Promise.race against `AbortController`), and an
   internal `gap(reason)` helper that always cites FEMA NFHL as the source.
4. Add `getRiskProvider()` factory in `src/lib/providers/index.ts`; export
   `RiskProvider`/`RiskQuery` from the barrel.
5. Add `riskProvider` to `config.ts`; extend `coreLiveModeViolations()`.
6. Rewrite `runRisk` in `src/lib/agents/scouts.ts:121-144` to use the seam +
   `withBudget` and produce ok / insufficient_evidence / budget_exceeded.
7. Extend the risk-scout `allowlist` to include `"FEMA"` and `"NFHL"`
   (location TBD — find via `grep -n "risk" src/lib/agents/dispatcher.ts`).
8. Tests (vitest, single fork — see playbook):
   - `src/lib/providers/real.test.ts` — add cases for
     `FemaNfhlRiskProvider`: stub `global.fetch` to return (i) a feature with
     `FLD_ZONE:"AE"` → grade-A card cited to NFHL; (ii) `{features:[]}` →
     grade-D gap; (iii) non-200 → grade-D gap; (iv) rejecting fetch
     (use a plain function impl per playbook row 8) → grade-D gap, no
     phantom unhandled rejection.
   - `src/lib/agents/scouts.cache.test.ts` — extend to cover that two
     same-H3 risk calls hit cache (calls:0 on the second).
   - New `src/lib/agents/scouts.risk.test.ts` — `runRisk` returns `ok` with
     a grade-A card when the mock zone-A fixture is returned; honors the
     allowlist filter.
9. Live probe (manual, not in CI): one `curl` against the NFHL URL with a
   known SFHA lng/lat (Houston Heights `-95.3979,29.7858` typically yields
   AE) — record the exact response shape in a comment above the adapter so
   the next agent doesn't re-discover it.
10. `npm run typecheck && npm run lint && npm test`.
11. `npm run agent:check -- --risk=medium` then `agent:checkpoint`.

**Acceptance scenarios:**
- *Happy (in-coverage SFHA point)*: response includes a feature with
  `FLD_ZONE` → ONE grade-A card, `value` includes the zone code AND an SFHA
  yes/no string, `sources[0].name === "FEMA NFHL"` with a working URL,
  status `ok`, `calls: 1`.
- *Happy (in-coverage non-SFHA, e.g. "X")*: same shape, `value` includes
  `SFHA: no`, grade A, status `ok`.
- *Empty (no features at the point)*: ONE grade-D card, reasoning mentions
  "outside NFHL coverage", source still cites FEMA NFHL, status
  `insufficient_evidence`.
- *Failure (non-200 / network error / timeout)*: ONE grade-D card with
  reasoning naming the failure mode, status `insufficient_evidence` for
  HTTP errors and `budget_exceeded` for the timeout path. NEVER throws.
- *Allowlist*: with allowlist=[`"FEMA"`,`"NFHL"`] the card survives the
  `scouts.ts:182-188` filter; with allowlist=[`"OpenStreetMap"`] the card is
  rejected and status becomes `insufficient_evidence` with the
  "card(s) rejected" gap (existing behavior).
- *Cache*: second call with same H3 returns `cacheHit:true`, `calls:0` (only
  when the first was `ok`).
- *Non-US (e.g. London 51.5,-0.12)*: clean grade-D gap, no exception.

**Break plan (adversarial):**
- Malformed JSON / HTML 500 page from NFHL → adapter still returns one
  grade-D card.
- 8-second hang → `withBudget` returns fallback, status `budget_exceeded`,
  the rejecting fetch promise is `.catch(noop)`-attached so vitest doesn't
  flag a phantom unhandled rejection (playbook row 8).
- `lng`/`lat` swapped by caller → NFHL returns 0 features → grade-D gap (no
  crash, no naked claim).
- Feature with `FLD_ZONE: null` / missing → grade-D gap with reasoning
  "NFHL returned a feature without a zone code".
- `FORLEADS_RISK_PROVIDER=mock` in production → `coreLiveModeViolations()`
  flags `"risk"` and the existing live-mode gate fails.
- Two concurrent calls for the same H3 → single network call due to existing
  `getCache()` semantics; if not, that's a pre-existing bug, file separately.

**Verification evidence:**
- `npm test -- providers/real.test.ts scouts.risk.test.ts scouts.cache.test.ts`
  → all green (full-suite run preferred per token-waste memory).
- `npm run typecheck` clean.
- One live probe captured (curl) in PR description, with response shape.
- Vercel preview deploy: open a US address in the lead rail, screenshot the
  Risk row showing "Flood zone: AE — SFHA: yes · FEMA NFHL".
- Vercel preview: open a London address, screenshot the Risk row showing
  the honest grade-D with NFHL citation + "outside NFHL coverage" reasoning.

**Cost / context budget:**
- 1 outbound HTTPS GET per uncached point. Free, no key, no rate-limit
  documented but keep `maxCalls: 1` budget and rely on the H3 cache.
- Soft 8s timeout (matches Overpass; NFHL p95 is ~1s).
- Plan context budget: ≤6 source files read end-to-end (already done).

**Risks / gotchas:**
- See playbook row 6 (`User-Agent` requirement) — also set a descriptive UA
  on NFHL calls even though ArcGIS doesn't strictly require it.
- See playbook row 8 — mock `fetch` rejection paths with a **plain function**
  in tests, not `vi.fn`, to avoid phantom unhandled rejections.
- See playbook row 3 (`fetch failed` in sandbox) — for the manual probe, try
  `fetch` then fall back to `curl --fail --max-time 8`.
- NFHL service is occasionally down for maintenance — graceful degradation
  invariant requires we serve a grade-D card, NEVER a 500 from `/api/lead`.
- ArcGIS sometimes ignores `f=geojson` and returns ESRI JSON; tolerate both
  by checking for `features[*].attributes.FLD_ZONE` in addition to
  `features[*].properties.FLD_ZONE`.
- Do NOT cache `budget_exceeded` (existing rule in `runScoutCached`,
  `scouts.ts:236-247` — already correct).

**Human-in-the-loop:**
- None for first deploy: no secret, no key, no destructive mutation.
- Before merge, post 3–6 specific Vercel-toolbar feedback questions per
  `feedback-before-merge` memory (e.g., "is the SFHA wording clear?", "is
  the citation link useful or noisy?").
- Per `pr-as-handoff-with-video`, attach a Playwright video showing a US
  address (grade-A) and a non-US address (grade-D) in the same lead rail.

**Done criteria:**
- [ ] `runRisk` returns a grade-A card for at least one known SFHA point in
  Vercel preview, cited to FEMA NFHL.
- [ ] Non-US address returns a grade-D card cited to FEMA NFHL with a clear
  "out of coverage" reason; UI never shows the old "no provider configured"
  copy.
- [ ] `FORLEADS_RISK_PROVIDER` env var documented in `.env.example`.
- [ ] `coreLiveModeViolations()` flags `"risk"` when mock is selected in prod.
- [ ] Vitest + typecheck + lint green; `npm run agent:check -- --risk=medium`
  passes.
- [ ] PR body has the Playwright video + curl probe trace per
  `video-in-pr-required` and `pr-as-handoff-with-video` memories.

---

## Reviewer summary (for the structured output)

- **Files touched (verified to exist via `ls`):**
  - `src/lib/providers/types.ts` (edit — append `RiskProvider`/`RiskQuery`)
  - `src/lib/providers/real.ts` (edit — add `FemaNfhlRiskProvider`)
  - `src/lib/providers/mock.ts` (edit — add `MockRiskProvider`)
  - `src/lib/providers/index.ts` (edit — add `getRiskProvider`)
  - `src/lib/providers/real.test.ts` (edit — adapter tests)
  - `src/lib/core/config.ts` (edit — add `riskProvider`, extend
    `coreLiveModeViolations`)
  - `src/lib/agents/scouts.ts` (edit — rewrite `runRisk` at lines 121-144)
  - `src/lib/agents/scouts.cache.test.ts` (edit — risk-cache case)
  - `src/lib/agents/dispatcher.ts` (edit — extend risk allowlist with
    "FEMA"/"NFHL"; verify file/line before editing)
  - `src/lib/agents/scouts.risk.test.ts` (new — runRisk integration test)
  - `.env.example` (edit — add `FORLEADS_RISK_PROVIDER`)

- **Open decisions (for AskUserQuestion later):**
  1. Card `value` wording — `"AE — SFHA: yes"` vs `"AE (high-risk)"` vs both
     in `claim`/`value`. Want product taste before locking copy.
  2. Should the Risk row link out to the live FEMA NFHL viewer for the exact
     point (deep link via lng/lat) in addition to citing the layer URL? UX
     decision, not technical.
  3. Allowlist source of truth — extend `dispatcher.ts` per-scout config, or
     promote allowlist defaults to `src/lib/core/types.ts`? Pattern preference.

- **Dependencies:** none. WS-B is independent of WS-A/WS-C/WS-K. Downstream:
  WS-J ("flip real send live") implicitly benefits because Risk now has a
  real signal, but does not block this PR.

- **Estimated hours:** **3–4 hours** solo-founder pace.
  - 30 min seam + factory + config.
  - 60–90 min adapter + manual curl probe + ESRI-JSON tolerance.
  - 60 min unit + integration tests.
  - 30 min PR body, Playwright video, toolbar feedback questions.

- **Rollback:** Single-env-var revert. Set
  `FORLEADS_RISK_PROVIDER=mock` in Vercel prod env and redeploy; `runRisk`
  immediately falls back to `MockRiskProvider` (which itself returns a
  grade-D card, matching today's behavior). If a deeper code revert is
  required, `git revert <merge-sha>` of the PR is safe — there are no
  migrations, no persisted rows, no schema changes, no connector writes.
