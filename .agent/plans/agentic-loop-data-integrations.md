# Plan: Production agentic lead intelligence loop

**Goal:** Turn Forleads from a strong map-and-draft prototype into a
production-testable real-estate operating loop: find a lead, enrich it with
lawful provider facts, score distress, prepare the next action, require human
approval, write to the right tool, learn the outcome, and keep follow-up alive.

**Why / value:** The current screenshots show the right bones but the wrong
operator confidence. Pipeline, Action Inbox, and Loop Studio read like internal
systems instead of a money workflow. D-grade cards are honest, but they do not
yet tell the user exactly which open/public/self-hosted source can unlock
owner, occupancy, ARV, hazard, or distress intelligence for a market.

**Simulated expert board:**

- **America / wholesaling operator:** Prioritize owner, mailing address,
  absentee status, equity, tax delinquency, pre-foreclosure, vacant signals,
  and speed from field note to Gmail/CRM follow-up.
- **England / estate and lettings operator:** Prioritize compliance-safe
  record provenance, valuation confidence, EPC/planning-style evidence, and
  clean approval history before any outreach.
- **Europe / cross-border data operator:** Prioritize GDPR-style minimization,
  per-market provider allowlists, explicit source licensing, and no inferred
  protected-class targeting.
- **Africa / mobile-first scout operator:** Prioritize low-bandwidth capture,
  GPS route coverage, photos, offline-friendly field notes, WhatsApp/SMS-ready
  actions, and neighborhood memory that works when formal records are sparse.
- **Lead engineering board:** Keep every provider behind seams, never invent
  facts, fail closed on missing sources, log idempotent writes, expose setup
  state in the UI, and make every automated loop inspectable.

**Current → desired behavior:**

- D-grade cards say "no provider configured" → D-grade cards plus Connector Hub
  show exact open-source/public-data setup gates for owner, market, distress,
  hazard, field-scout, contact, and automation signals.
- Pipeline is a passive status board → Pipeline becomes a lead command center:
  intelligence gaps, next money action, and where each lead is stuck.
- Action Inbox shows prepared artifacts and can surface "internal error" →
  Action Inbox is an approval console with setup-required failures surfaced as
  user-fixable integration gaps.
- Loop Studio is abstract automation → Loop Studio is the automation workbench:
  "watch for no-contact / stale lead / interested seller, prepare work, require
  approval, write back, report."

**Open/free-source provider phases:**

1. **No-cost global floor, already live:** Nominatim geocode, OSM building
   facts, Mapillary imagery, Claude reasoning, Supabase persistence.
2. **Open building intelligence:** OSM, Microsoft Building Footprints, Google
   Open Buildings, and local open GIS layers for footprint, building presence,
   and sparse-market coverage.
3. **Open market records:** HM Land Registry Price Paid where applicable,
   county assessor/open-data CSVs, city portals, and manually imported public
   sale/valuation exports. If no open source exists, the product must say so.
4. **Open distress and hazard:** county tax delinquency lists, code violation
   portals, vacant-property registries, court notices where public, FEMA NFHL,
   and local hazard GIS.
5. **Field-scout pack:** mobile capture, GPS route coverage, photo upload,
   property condition tags, duplicate-street avoidance, and offline retry.
6. **Consent-first contact pack:** Google OAuth, operator-owned contacts, CRM
   imports, and manually captured public-record contact facts. Do not claim
   "free skip tracing" as a global lawful source.
7. **Free automation bridge:** self-hosted n8n or generic webhooks for approved
   postcard/dialer/job queues; Gmail drafts remain the first real external
   proof path.
8. **CRM pack:** Follow Up Boss or GoHighLevel for tasks, notes, campaigns, and
   contact sync. Missing keys must block writes as setup-required.

**Non-goals for this slice:** Buying provider accounts, pretending PropStream,
MLS, or skip-trace data exists, auto-sending outreach, or doing destructive
production mutations.

**Risk tier:** high — production providers, contact data, connector writes,
human approval, and tenant-scoped persistence.

**Implementation slice now:**

1. Add an open-source/public-data readiness matrix surfaced in Connector Hub.
2. Add env placeholders for open GIS/CSV/webhook sources.
3. Make approval setup failures return a client-safe setup-required response.
4. Reframe Pipeline and Loop Studio around operator value and money actions.
5. Add tests for setup-required approval errors and provider readiness.

**Regional extension now implemented:**

1. America / US: county/Socrata sales, FEMA NFHL, tax delinquency, code violation,
   vacant registry, and operator CSV import env hooks.
2. England / Wales: HM Land Registry Price Paid no-header CSV support plus
   council/hazard/distress env hooks.
3. Europe: per-country open sales/cadastral, hazard, and municipal distress env hooks.
4. Africa: field-first pack with Google/Microsoft/open building footprints,
   local open GIS, field-scout capture, and operator imports where formal sale
   feeds are sparse.
5. Provider layer reads multiple regional feed URLs and only upgrades cards from
   cited records that conservatively match the target address.

**Acceptance scenarios:**

- Production without open sales/distress/hazard feeds clearly says owner, ARV,
  distress, and hazard intelligence are setup-required.
- A task artifact approval without CRM keys returns a helpful 424 message, not
  `internal error`.
- Connector Hub tells the user what is live, what is missing, and which open
  source or self-hosted feed unlocks each class of intelligence.
- Pipeline and Loop Studio explain the workflow in operator terms without
  pretending unconfigured integrations are live.

**Live-testing boundary:** The first fully real external proof remains Gmail
draft creation after Google OAuth. Open sales, hazard, building-footprint, and
distress testing becomes live only after the user configures a lawful
public-data feed for the target market.
