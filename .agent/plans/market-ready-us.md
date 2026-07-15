# Plan: Market-ready United States product loop

## /goal (falsifiable)

Forleads becomes the evidence-to-action layer for geographic real-estate
farming: a listing-focused solo agent or 2–5 person team can define or import a
farm anywhere in the United States, see exactly which official and licensed
sources cover each property, turn lawful property and field signals into
reviewable actions, and write approved work into the tools they already use.
Oklahoma is a named launch market. A source, connector, or market is never
called live until the exact capability is exercised successfully.

Market readiness is proven when a four-week paid design-partner cohort of ten
agents (at least three in Oklahoma) reaches all of these outcomes:

- 70% create or import a farm in the first session.
- median time to first sourced opportunity is under ten minutes.
- at least 80% of rendered property claims carry source, as-of date, and grade.
- at least five users approve ten or more actions per week.
- at least three users remain weekly active through week four and pay $49–79
  without concierge dependence.

Until retained paid behavior exists, the honest claim is **market-test ready**,
not product-market-fit proven.

**Why / value:** The repo has strong provenance, approval, persistence, and
trace foundations. The current revenue blocker is not another agent framework;
it is visible product credibility. Configuration is sometimes presented as
capability, contacts are secondary to property cards, the farm workflow is one
address at a time, and nationwide depth is not yet truthful.

**User / job:** A listing-focused solo residential agent or 2–5 person team,
already using Gmail and often Follow Up Boss, farming one to three
neighborhoods. They need to know which properties deserve attention, why,
whether a person can lawfully be contacted, and what to do next without
re-entering work across maps, county sites, email, and CRM.

**Pain evidence:**

- NAR's 2025 Technology Survey reports time saving (66%) and client experience
  (64%) as the leading technology motivations; 34% spent $50–250 per month on
  technology. Source: https://www.nar.realtor/research-and-statistics/research-reports/realtor-technology-survey
- Current repo audit: licensed provider keys can make Connect say `live` even
  though `LicensedPropertyProvider` still returns only grade-D mapping gaps.
- Current repo audit: Follow Up Boss and GoHighLevel advertise note/task writes
  without binding the required provider contact id; contact sync counts rows
  but persists none.
- Rendered production-build QA on 2026-07-15: the app renders, but the first
  screen uses internal terms (`operator launchpad`, `scout pass`) and presents
  an empty disabled action rail before the user has a property.
- The built-in U.S. catalog has selected city/state sources plus FEMA; there is
  no Oklahoma source and no national parcel/sale/contact layer.

**Current -> desired behavior:**

- `env present` -> `configured`, `credential verified`, `capability verified`,
  `coverage at this property`, and `degraded` are distinct states.
- `anywhere on Earth` implication -> precise nationwide baseline plus visible
  market-by-market depth.
- one typed address -> farm boundary/CSV/CRM import and a ranked daily brief.
- address-first cards -> contactability passport beside every relationship.
- generic Kanban -> farm table with provenance cells, sorting, bulk waterfall,
  and export.
- one-by-one approvals -> evidence-bound approve/edit/skip cadence.
- paid-provider checklist -> implemented-adapter checklist with cost, terms,
  coverage, and a broker-ready approval packet.

**Non-goals:** auto-send; guessed seller intent; protected-class targeting;
MLS scraping; treating assessor ownership as consent; buying keys without owner
approval; claiming all-state free property depth; shipping eight arbitrary
features per loop.

**Risk tier:** High. Connectors, licensed data, contact consent, tenant routing,
external writes, and national coverage claims are trust boundaries.

**Opportunity funnel per loop:** Each loop must produce at least eight
source-grounded transformation candidates, tagged with `revenue_enabled`,
`risk_reduced`, `money_saved`, or `engineering_leverage`. Rank by user pain,
measurable lift, differentiation, implementation cost, and risk. Implement only
the highest-value coherent slice; rejected ideas remain in the score record.

## Sprints

### Sprint 0 — Capability truth and launch floor

- Stop marking stub or unused provider env vars as live.
- Distinguish configured from verified capability in Connect and docs.
- Remove instructions to buy keys for adapters that are not implemented.
- Fix the local dev runtime path if Turbopack verification proves it reliable.
- Correct Microsoft callback documentation; keep Microsoft, FUB, GHL, Twilio,
  and multi-tenant Zapier setup blocked until their named defects are fixed.

Acceptance: credentials alone never produce a live badge; tests cover every
stub; build and production-mode rendered QA pass; no user is told to purchase a
provider before an adapter exists.

### Sprint 1 — Oklahoma official-source launch pack

- Add a generalized ArcGIS parcel-point catalog contract.
- Implement Oklahoma County parcel assessment/sale facts from the official
  public service, with license/freshness caution and no consent inference.
- Add Tulsa only after current terms and freshness are verified.
- Add Oklahoma coverage state as county-partial, not statewide-live.
- Research the Oklahoma Corporation Commission well/orphan/incident lane as
  contextual evidence, never a parcel-condition accusation.

Acceptance: a real Oklahoma County address returns official sourced facts;
point-on-boundary, null value, timeout, 429/498/503, HTML/WAF, schema drift, and
owner-to-contact separation are tested; live endpoint probe is recorded.

### Sprint 2 — Contact-forward relationship workflow

- Put contact name, allowed channels, source, opt-out state, and verification
  beside the property on Map and Deals.
- Add a contactability passport and block outbound actions when eligibility is
  unknown.
- Replace misleading FUB/GHL capabilities with setup-blocked states until
  contact import/id mapping and provider-contract tests pass.
- Implement a real FUB overlay: import people, attach provider person ids,
  enrich property relationships, then write notes/tasks/appointments back.

Acceptance: no public owner field becomes a consented contact; live writes bind
the correct provider person; pagination, duplicates, missing address, cross-
tenant ids, provider 401/429/timeout, and retry paths are covered.

### Sprint 3 — Farm table and truth-gap waterfall

- Add farm creation by CSV and a bounded map area.
- Render rows as property relationships and columns as sale, assessment,
  distress, hazard, contactability, last touch, next action, source date, and
  grade.
- Show attempted sources, hit/miss/error/setup-required, cost, and next source.
- Add enriched CSV export and transparent bulk-run budgets.

Acceptance: 50-row import, malformed CSV, duplicates, partial provider failure,
cost cap, cancellation, and export provenance are verified.

### Sprint 4 — Evidence-bound approvals and Porch Mode

- Add approve/edit/skip cadence with trigger, evidence, permission state,
  destination, and side effect visible on every action.
- Add mobile-first, offline-tolerant note/outcome/photo/next-visit capture.
- Verify at 390px and desktop against happy, empty, failure, and recovery paths.

### Sprint 5 — Nationwide depth

- Keep Census geocoding/geo context, FEMA, OSM, and operator evidence as the
  truthful national baseline.
- Implement one licensed national adapter end to end (Regrid first for parcel
  truth; RentCast next for clearly labeled estimates/comps) only after terms,
  cache, cost, and storage review.
- Add county/state source contracts incrementally with automated live probes.

Acceptance: representative addresses across all Census regions and Oklahoma;
point-level coverage truth; provider cost/quota/freshness visible; paid failure
degrades to sourced free layers without invented facts.

### Sprint 6 — External-write reliability and compliance

- Reserve durable idempotency state before external calls and reconcile
  uncertain outcomes.
- Persist Microsoft refresh-token rotation.
- Make Zapier inbound tenant-bound and signed.
- Implement SMS only after durable consent, DNC/STOP, quiet hours, sender scope,
  A2P readiness, and status callbacks exist.

### Sprint 7 — Market test and launch

- Add activation, coverage, provider-miss, setup-block, approval, reply,
  appointment, listing-opportunity, cost, and retention events.
- Run the four-week paid design-partner cohort and re-rank from retained
  behavior rather than roadmap opinion.
- Ship pricing only as a test: $49 design partner, $79 Pro overlay, team pricing
  after permissions/audit/manager workflows exist.

## Break plan and stop rules

- Stop on a red mandatory gate, fabricated external success, cross-tenant
  behavior, missing consent, unclear license, spend, secret, or production
  mutation without approval.
- Never translate provider failure into `no sale`, `no violation`, or `no risk`.
- A configured key with 401/429/schema drift is not live.
- Two concurrent approvals must produce at most one external side effect; a
  crash after the side effect must reconcile rather than blindly resend.
- Checkpoint and score after every sprint. Merge only verified coherent slices.

**Verification evidence:** targeted Vitest; `npm run typecheck`; `npm run lint`;
`npm test`; `npm run agent:eval`; coverage; `npm run build`; production-build
desktop and 390px browser QA; live source curl for every catalog addition;
read-only production `/api/health`; CI before merge.

**Human-in-the-loop:** OAuth account grants, API/MLS/vendor agreements, paid
keys, SMS business/A2P registration, legal review of data/outreach terms,
design-partner recruitment, pricing collection, deployment or production
mutation not already implied by an explicitly approved merge.

