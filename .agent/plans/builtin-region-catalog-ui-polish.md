# Plan: Built-in verified region data catalog + pro UI polish

> Model-agnostic. Everything a model needs is here — don't rely on the model
> "being smart." If a step needs intelligence, specify it.

**Goal:** Forleads grounds real sale/assessment/distress/hazard evidence with ZERO env configuration in USA, Canada, and Europe, and the UI reads as a finished product (no emoji glyphs, mobile nav, keyboard search, no dead buttons).

**Why / value:** "Setup required" on every data card meant a new workspace proved nothing. Built-in verified feeds are the product's core promise (grounded, never guessed) working on first open — that is the conversion moment.

**User / job:** A real-estate operator opens any address in a covered market and expects sourced facts, not gaps; a phone user expects usable navigation.

**Pain evidence:** PR #39 wired loaders but every source needed an env URL; readiness showed setup_required across all regions. Emoji nav/tools rendered inconsistently (user asked for pro-level UI critique loop).

**Current → desired behavior:** Before: comps/distress/hazards return grade-D "not configured" everywhere unless the operator pastes URLs. After: NYC/Philly sales, NYC/Chicago/Philly violations, FEMA + EA flood, Calgary/Edmonton/Winnipeg/Vancouver assessments, HMLR price-paid, France DVF all ground live by bbox with per-address server-side queries; operator env feeds still merge in; uncovered markets stay honest gaps.

**Non-goals:** Africa live feeds (Cape Town's service verified down — stays field-first, said honestly); Cook County (PIN-keyed, no address column); paid data; auto-send anything.

**Risk tier:** high — external providers + provider defaults change (production propertyProvider osm→open-data, risk provider live by default).

**Context links:** src/lib/providers/{catalog.ts,real.ts,readiness.ts,index.ts}, src/lib/core/config.ts, docs/Forleads_MapGIS_v1.md §8, PR #39.

**Seams & exact files:** CatalogSource/queryCatalogSales/queryCatalogDistress/catalogHazardEndpoints in catalog.ts; OpenDataPropertyProvider.comps + OpenRiskDataProvider.{hazards,distress} merge env+catalog; readiness builds region packs from OPEN_DATA_CATALOG; UI: page.tsx, MapWorkspace, ActionInbox, ReviewTray, ConnectorHub, icons.tsx, globals.css.

**Steps:**
1. Live-verify candidate endpoints (curl) per region; drop dead ones (LA Socrata retired, cquest 502, Cape Town down).
2. catalog.ts with per-style handlers (Socrata $q, CARTO SQL escaped, ODS where + civic filter, HMLR postcode + dual paon/saon composition, DVF commune CSV via geo.api.gouv.fr + 6h cache).
3. Merge into providers; honest-gap reasoning depends on real coverage at the point.
4. readiness region packs live-by-default listing verified markets; Africa manual_capture with verified-down note.
5. UI: SVG icons, mobile bottom nav, combobox keyboard nav, send-not-mic, Why blocked?, per-tab empty states.

**Acceptance scenarios:** covered-market address → grounded card with source+license page; uncovered point → grade-D gap with "don't cover this market yet"; source outage → that source contributes nothing, others still ground; mobile 375px → bottom tab bar, no side rail.

**Break plan:** LIVE_CATALOG=1 harness hits every real endpoint (10/10 pass 2026-07-05); quote-escape test for CARTO SQL; postcode-less UK address skips HMLR instead of guessing; Vancouver civic-number filter proven against 1,642-row street.

**Verification evidence:** `npx vitest run` (248 pass), `LIVE_CATALOG=1 npx vitest run src/lib/providers/catalog.live.test.ts` (10 pass live), `tsc --noEmit`, lint clean, `npm run agent:check -- --risk=high`, Vercel preview visual QA.

**Cost / context budget:** all sources free/open-licensed; runtime per-lookup ≤ ~6 fetches with 8s timeouts inside existing scout budgets; DVF commune CSV cached 6h.

**Risks / gotchas:** source rot (mitigated by live harness — rerun when touching catalog); Socrata rate limits without app token (throttle: card degrades to gap, honest); DVF commune codes differ for Paris/Lyon/Marseille arrondissements (handled via type=arrondissement-municipal).

**Human-in-the-loop:** none for data (all public/open-licensed); merge approval per repo rules.

**Done criteria:** live harness 10/10; unit suite green; regions show live in Connector Hub with market lists; UI changes verified on Vercel preview; PR with demo evidence.
