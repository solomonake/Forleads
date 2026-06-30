# Plan: WS-G — Drive-by farming (GPS trail → ranked street)

> Model-agnostic. Everything a model needs is here — don't rely on the model
> "being smart." If a step needs intelligence, specify it.

**Goal:** Behind explicit, revocable consent, capture a driving trail via the
browser Geolocation API, aggregate it into H3 r10 cells, run only ambient
(cheap, lawful-public-signal) scouts over those cells, and surface a
"ranked street" view — a sorted list of doors/parcels in the farmed area
worth knocking, each rank backed by cited EvidenceCards and *never* by a
protected attribute.

**Why / value:** UC-3 (Drive-by farming) is the headline pre-knock workflow
for agents prospecting their farm. Today they drive blind and door-to-door.
With WS-G, a 20-minute drive becomes a ranked, cited shortlist — pre-warmed
in cache so the swarm answers instantly when the agent taps a door. Loops
back into UC-1/UC-2 (full swarm on tap) and creates the "ambient agent that
earns its keep" moat called out in `docs/Forleads_Vision_v1.md`.

**User / job:** A licensed agent driving their farm wants their phone to
quietly note which streets are most likely to sell — long tenure, recent
land-use change, lawful public probate signal — so they can decide which
3–5 doors to walk back to, not all 80.

**Pain evidence:**
- `docs/Forleads_UserCases_v1.md` UC-3 — "Manual list, gut feel, door-to-door
  blind" is the documented status quo.
- No trail-capture surface today: `find src -iname '*trail*' -o -iname '*gps*'`
  returns nothing; the only geo helpers are in `src/lib/core/geo.ts` and
  `src/app/api/geocode`.
- Scout dispatcher (`src/lib/agents/dispatcher.ts:16-48`) has no "ambient"
  budget tier — every dispatch today assumes a deliberate tap.
- `src/lib/agents/scouts.ts:171` only runs single-point inputs; no batch over
  an H3 cell set.

**Current → desired behavior:**
- *Current:* the map renders one address tap → swarm. No trail; no batch
  pre-warm; no ranked-street view; no consent surface beyond Google OAuth.
- *Desired:* Agent opens `/farm`, clicks **Start drive**, grants Geolocation
  permission (browser native prompt + our own in-app consent toggle).
  Position samples post to `/api/farm/trail` every 10–30s, get H3-binned,
  and quietly enqueue ambient scouts (capped: 1 per H3 cell per drive, only
  `property` + `market` + `risk` providers in *cheap mode* — no paid lookups
  unless WS-A budget allows). When the drive ends (or the agent opens the
  ranked panel), `/api/farm/ranked?driveId=...` returns the cells sorted by
  a transparent score over cited signals. Each row links into the existing
  MapWorkspace tap flow and the full swarm.

**Non-goals:**
- Cross-session "always-on" tracking. A drive is a bounded session (explicit
  start, explicit stop, hard timeout 4h). No background-tab capture.
- Persisting raw lat/lng beyond the drive. Trail rows are aggregated to H3
  cells before storage; raw points live only in the browser session or a
  short-TTL cache key.
- Paid provider calls during ambient pre-warm by default. WS-G must
  *coordinate* with WS-A's budget guard, not bypass it.
- Owner-attribute ranking. Tenure (year_built / years_owned), land-use
  change, and lawfully public probate are the only signals; no demographic
  inference, no fair-housing-adjacent fields.
- A new map renderer. WS-G uses the existing `MapWorkspace.tsx`.
- Mobile-native app. Browser-only, mobile Safari + Chrome.

**Risk tier:** **high.** Geolocation is privacy-sensitive (lat/lng is PII),
the ranking output materially shapes who an agent solicits (fair-housing
surface), and the ambient dispatcher could silently burn paid budget if not
gated. Per AGENTS.md §risk tiers: privacy + agent policy + potential
external-provider spend = high. Requires coverage, build, adversarial tests,
rollback notes, and a security-reviewer pass on the consent + retention path.

**Context links:**
- `docs/Forleads_Vision_v1.md` §6 (grounding moat), §7 (anti-goals incl.
  "never demographic targeting"), §9 (ambient swarm).
- `docs/Forleads_UserCases_v1.md` UC-3.
- `docs/Forleads_MapGIS_v1.md` §4 (H3 grid intent).
- `.agent/playbook.md` — "Seam pattern", "No naked numbers", "Live AI = one
  seam + total fallback", in-memory cache caveat.
- `.agent/plans/ws-a.md` — owns the paid-provider budget guard
  (`src/lib/providers/budget.ts`) WS-G will respect.
- Existing seams to reuse (do NOT re-invent):
  - `src/lib/core/geo.ts:11` — `h3Key(lng, lat, res=10)` already deterministic.
  - `src/lib/agents/dispatcher.ts:13-72` — `ScoutType` registry + per-scout
    budgets; add an `ambient` mode toggle, do not fork the dispatcher.
  - `src/lib/agents/scouts.ts:225` — scouts already cache-key on H3.
  - `src/lib/cache/index.ts` — `CacheStore` for trail + ranked cache.
  - `src/lib/auth/agent.ts` — `requireAgentId()` for tenant isolation
    (gotchas row "IDOR — never read agentId from request").
  - `src/components/MapWorkspace.tsx` — existing map surface to overlay
    the trail polyline + ranked panel.

**Seams & exact files:**

*Edits (existing):*
- `src/lib/agents/dispatcher.ts:16-48` — add an `ambient: boolean` field
  on the dispatch input. When true: only `property` + `market` + `risk`
  scouts; force `paidCallsAllowed=false` (provider.facts may still run
  free OSM path); cap `maxScouts` to 1 per cell.
- `src/lib/agents/scouts.ts` — accept a `paidCallsAllowed` flag in
  `ScoutInput`; thread to providers so WS-A's `AttomPropertyProvider`
  short-circuits to OSM fallback in ambient mode without consuming budget.
- `src/components/MapWorkspace.tsx` — render trail polyline overlay when
  an active drive exists; mount the new `<DriveControls/>` and
  `<RankedStreetPanel/>` (lazy).
- `src/lib/core/types.ts:18` — no change to `ScoutType`; add a new
  `DriveSession` and `RankedCell` type alongside existing types.

*New files:*
- `src/app/api/farm/trail/start/route.ts` — `POST` opens a `DriveSession`
  (`{ driveId, agentId, startedAt, consentVersion }`), returns `driveId`.
  Requires `requireAgentId()`. 401 if no session.
- `src/app/api/farm/trail/point/route.ts` — `POST { driveId, points: [{lng,lat,ts}] }`
  validates ownership of `driveId`, normalizes points to H3 r10 cells,
  enqueues ambient dispatch per *new* cell (dedupe with `trail:cells:<driveId>`),
  responds with `{ binnedCells: number, newCells: number }`. Rate-limited
  (≤ 6 req/min/drive).
- `src/app/api/farm/trail/stop/route.ts` — `POST { driveId }` marks the
  session ended, kicks off ranking computation (idempotent), returns
  `{ ok, cellCount }`.
- `src/app/api/farm/ranked/route.ts` — `GET ?driveId=...` returns sorted
  `RankedCell[]` with cited signals + score breakdown. Owner-only.
- `src/lib/farm/drive.ts` — `DriveSession` repo backed by `CacheStore`
  (TTL 4h). Functions: `openDrive`, `appendPoints`, `endDrive`, `loadDrive`.
- `src/lib/farm/ranker.ts` — pure function
  `rankCells(cellSignals: CellSignals[]): RankedCell[]`. Score is a
  transparent, documented weighted sum over allowed signals only; emits a
  per-cell `reasoning` array of cited EvidenceCard ids. No model call.
- `src/lib/farm/signals.ts` — given an H3 cell, fan out ambient scouts
  via the dispatcher and collect grade A/B EvidenceCards into a
  `CellSignals` record. Honors `paidCallsAllowed=false`.
- `src/lib/farm/consent.ts` — `consentVersion` constant; `assertConsent()`
  helper called on every trail write. Logs to trace (`farm.consent.granted`,
  `farm.consent.revoked`).
- `src/components/farm/DriveControls.tsx` — Start/Stop button, in-app
  consent toggle ("Use my location for this drive only"), live point count,
  hard-stop at 4h, revoke link.
- `src/components/farm/RankedStreetPanel.tsx` — sorted list of cells with
  the citation chips users can tap (re-uses existing EvidenceCard chip).
- `src/components/farm/useDriveTrail.ts` — React hook wrapping
  `navigator.geolocation.watchPosition`, throttling to 1 sample / 10–30s,
  POSTing to `/api/farm/trail/point` with retry/backoff. Cleans up on
  unmount or revoke.
- `src/app/farm/page.tsx` — page that mounts MapWorkspace + DriveControls
  + RankedStreetPanel; protected by `requireAgentId()` in a server
  component wrapper.
- Tests:
  - `src/lib/farm/ranker.test.ts` — score determinism, no-signal
    fallback, never-rank-on-protected-attribute regression.
  - `src/lib/farm/drive.test.ts` — open/append/end lifecycle, dedupe,
    cross-tenant isolation, 4h timeout.
  - `src/lib/farm/signals.test.ts` — ambient flag forces `paidCallsAllowed=false`;
    OSM fallback path produces cards even with no ATTOM key.
  - `src/app/api/farm/trail/point/route.test.ts` — auth, validation,
    rate-limit, cross-drive-write rejected.
  - `src/components/farm/useDriveTrail.test.tsx` — consent gate, throttle,
    unmount cleanup, revoke clears geolocation watcher.

**Steps:**
1. **Types + consent contract** (no behavior yet): add `DriveSession`,
   `RankedCell`, `CellSignals` to `src/lib/core/types.ts`; create
   `src/lib/farm/consent.ts` with a `CURRENT_CONSENT_VERSION` and helper.
2. **Drive repo** (`src/lib/farm/drive.ts`) + tests. Cache-backed,
   tenant-keyed. 4h hard TTL. Idempotent `appendPoints`.
3. **Ambient dispatch toggle** in `dispatcher.ts`: thread an `ambient` flag,
   forbid `imagery` + `people` scouts in ambient mode (cost + compliance).
   Tests in existing `dispatcher.neighborhood.test.ts` companion.
4. **Signals fan-out** (`src/lib/farm/signals.ts`) — calls dispatcher with
   `ambient=true, paidCallsAllowed=false`. Collects A/B cards by H3 cell.
5. **Pure ranker** (`src/lib/farm/ranker.ts`) — scoring rule:
   `score = w_tenure·tenureYears_norm + w_landuse_change + w_public_probate`,
   default weights `[0.5, 0.3, 0.2]`. Document each weight in code comment.
   Returns `RankedCell[]` with explicit `reasoning: EvidenceCardRef[]`.
   Regression test: any rank that uses a banned signal id throws.
6. **API routes**: `start` → `point` → `stop` → `ranked`. Each uses
   `requireAgentId()`; `point` and `stop` verify `driveId` belongs to caller.
   `point` is rate-limited via existing `src/lib/ratelimit/`.
7. **Hook + components**: `useDriveTrail` (geolocation + throttle + retry);
   `DriveControls` (consent UI, hard-stop, revoke); `RankedStreetPanel`
   (citations + tap-to-promote-to-full-swarm).
8. **Page**: `/farm` mounts everything; gated by session.
9. **Trace events** via `src/lib/agents/trace.ts`: `farm.drive.opened`,
   `farm.trail.point` (cell id only, no raw lat/lng), `farm.drive.ended`,
   `farm.ranked.computed`, `farm.consent.revoked`.
10. **Verification**: typecheck/lint/test, then Playwright video showing
    consent prompt → drive → ranked list with citations; revoke clears
    state. Preview deploy first, prod after human approval.

**Acceptance scenarios:**
- *Consent denied:* user clicks Start drive but denies browser permission →
  UI shows "Location off — drive cannot capture" empty state; no `start`
  call hits the server; nothing persisted.
- *Happy drive (10 cells, 15 min):* points binned to 10 unique H3 cells; one
  ambient dispatch per cell; ranked list returns 10 rows sorted, top row's
  `reasoning[]` cites ≥1 grade-A/B card; tap promotes to MapWorkspace full
  swarm.
- *Revoke mid-drive:* user toggles consent off → `watchPosition` is cleared
  synchronously, an explicit `POST /trail/stop` fires, `farm.consent.revoked`
  traced. Subsequent `point` requests rejected.
- *Cross-tenant attack:* tenant B `POST /trail/point` with tenant A's
  `driveId` → 403; isolation test green.
- *Ambient never spends:* with `ATTOM_API_KEY` set + a $5 cap, a full drive
  consumes $0; `provider.budget_exhausted` not fired; `provider.fallback_used`
  may be fired (graceful degradation).
- *Banned-signal regression:* ranker rejects (throws/test fails) if asked
  to weight any owner-attribute field returned by ATTOM (owner name, etc.).
- *4h timeout:* a drive open >4h is auto-ended on next `point` write; UI
  shows "Drive ended (4h limit)".
- *Empty ranking:* drive in a rural area with no cells producing A/B signals
  → ranked panel shows honest empty state with explanation, no fake rows.

**Break plan (adversarial):**
- 100 points/sec flood from one client → rate-limit 429; server-side dedupe
  per H3 cell prevents dispatch storm.
- Forged `driveId` from a different tenant → 403 (covered).
- `navigator.geolocation` not present (desktop browser, no GPS) → UI offers
  manual address entry; no crash.
- watchPosition emits high-error-radius samples (>500m accuracy) → filter
  client-side; do not enqueue.
- Server restart mid-drive (in-memory cache lost) → on next `point`, drive
  is gone → API returns `404 drive_not_found`; client re-opens a fresh drive
  with same consent (graceful, traced).
- Provider error storms during ambient fan-out → fail-closed: cell yields
  no signals, ranker omits it, no exception propagates to client.
- User holds phone past midnight UTC; budget counter rolls — ambient stays
  $0 because `paidCallsAllowed=false`.

**Verification evidence:**
- Gates: `npm run typecheck && npm run lint && npm test` — all green.
- Targeted: `npm test -- src/lib/farm` and
  `npm test -- src/app/api/farm/trail`.
- Live UI: `preview_start` → record Playwright session: consent prompt,
  start drive, simulated `watchPosition` (Chromium devtools sensor emulation),
  ranked panel renders within 5s of stop; revoke clears.
- Trace check: `GET /api/trace?driveId=...` shows the expected event
  sequence with H3 cell ids only — no raw lat/lng leakage (security test).
- Cost: `provider.call` count = 0 for ATTOM during a drive with cap unset
  or `paidCallsAllowed=false`.

**Cost / context budget:**
- Build: ≤35k context tokens (this packet ~3k; impl ~10k; tests ~7k).
- Paid: $0 ambient. If user opts in to "deep prefetch" (out of scope here,
  reserved for v2), WS-A budget guard authorizes per cell.
- Runtime: ≤1 dispatch per H3 cell per drive; ≤1 ranking computation per
  `stop` call (memoized).

**Risks / gotchas:**
- **In-memory cache caveat** (`src/lib/cache/index.ts`): on serverless cold
  start, an open drive can vanish. Document this; client must handle
  `404 drive_not_found` by re-opening. WS-M may upgrade to a durable
  `drive_session` table later.
- **Geolocation permission revocation is async in some browsers** — always
  pair revoke UI with `clearWatch()` and a server-side `stop` POST.
- **PII surface:** raw lat/lng must never enter trace events or Supabase
  rows. Store H3 cell ids only. Add a lint rule or test asserting trace
  payloads contain no `lat`/`lng` keys for `farm.*` events.
- **Fair-housing trap:** the ranker is the most dangerous artifact — any
  future weight on an owner-attribute breaks Vision §7 anti-goal #1. Make
  the allowed-signal allowlist a constant in `ranker.ts`, asserted by a
  regression test.
- **Battery / network on the agent's phone:** throttle aggressively (≥10s
  between samples), batch points per request, exponential backoff on 5xx.
- **Tenant isolation:** AGENTS.md invariant. Every farm route must derive
  `agentId` from session, never from request body (gotchas row 16).
- **Coordination with WS-A:** WS-G must consume the `paidCallsAllowed`
  flag added by WS-A's adapter; if WS-A's signature differs at merge time,
  reconcile before this packet implements.

**Human-in-the-loop:**
- *Decision:* "Allowed ambient signal allowlist v1" — tenure, land-use
  change, lawful public probate. Confirm before coding the ranker.
- *Decision:* "Drive session TTL — 4h enough?" Default 4h; user picks.
- *Decision:* "Where to host `/farm` in nav?" — likely sibling to existing
  MapWorkspace entry; UI lead's call.
- *Approval:* security-reviewer pass on the consent + retention story
  before prod env flip.
- *Secret:* none new — reuses Geolocation API (browser) and existing
  provider keys behind WS-A's budget guard.

**Dependencies on other workstreams:**
- **WS-A (Live property/owner data adapter)** — depends on the
  `paidCallsAllowed` flag WS-A adds when threading the budget guard into
  `AttomPropertyProvider`. WS-G consumes it; if WS-A ships first, no
  coordination needed. If WS-G ships first, stub the flag default to
  `false` and let WS-A wire it through.
- *(Indirect)* WS-M will likely promote the in-memory `DriveSession` repo
  to a durable Supabase table; until then, the cache-backed repo is the
  source of truth — documented limitation.

**Estimated hours (solo-founder pace):** **9–12 hours**
- 0.5h types + consent constant, 1h drive repo + tests, 1h dispatcher
  ambient flag, 1.5h signals fan-out + tests, 1h ranker + regression
  tests, 2h API routes + tests, 2h hook + components + page,
  0.5h trace wiring, 1h Playwright verification + PR video, 0.5h PR body.

**Done criteria:**
- [ ] Drive lifecycle (`start` → `point` → `stop` → `ranked`) implemented
      and tenant-isolated.
- [ ] Ambient dispatcher mode never triggers paid provider calls (test
      asserts `provider.call` count = 0 for ATTOM during a drive).
- [ ] Ranker uses only the v1 allowlist of signals; banned-signal
      regression test green.
- [ ] No raw lat/lng in any trace event or persisted row; H3 cell ids only.
- [ ] In-app consent toggle gates both client geolocation watcher and
      server writes; revoke clears both synchronously.
- [ ] 4h drive hard-stop enforced server-side.
- [ ] Cross-tenant `point`/`ranked` requests rejected with 403.
- [ ] `/farm` page renders trail polyline + ranked panel; tap on a row
      promotes the cell into MapWorkspace's existing full-swarm flow.
- [ ] Playwright video attached to PR per memory rule "Video in PR required."
- [ ] Graceful degradation: with ATTOM down, the ranked list still surfaces
      based on OSM-floor signals (may be sparser; honest about it).
