# Forleads United States market thesis v2

## Core value

> **Keep your CRM. Turn lawful property and field signals into sourced,
> compliant next actions.**

Forleads is the **evidence-to-action layer for geographic real-estate
farming**. It tells an agent which properties in a territory deserve attention,
why, whether a person can lawfully be contacted through a known channel, and
what to do next. It then prepares the action inside Gmail or Follow Up Boss for
human approval.

It is not another passive CRM, a high-volume wholesaler list, an automated
valuation oracle, or a seller-intent predictor. A more honest product line than
“every address is a lead” is:

> **Every property can become a grounded opportunity when a lawful signal
> exists.**

## First customer

The primary customer is a listing-focused solo residential agent or 2–5 person
team that farms one to three neighborhoods, handles at least roughly 30 leads a
month, uses Gmail and often Follow Up Boss, and already pays for prospecting or
data tools. They have enough activity and budget to feel the cost of dropped
follow-up, but they resist CRM migration.

New agents are an acquisition segment, not the first revenue engine. Large
brokerages are a later segment after permissions, compliance audit, and team
reporting. Investor wholesalers are not the wedge; PropStream and BatchLeads
already optimize high-volume motivated-seller list and outreach workflows.

## Jobs and pain

1. **Choose where to spend time.** County data, maps, field notes, email, and
   CRM are fragmented; the agent needs a ranked territory brief with proof.
2. **Trust a property fact.** Every sale, assessment, risk, and distress claim
   needs a source, date, grade, and honest failure state.
3. **Connect property to relationship.** Parcel ownership is not a consented
   contact. The agent needs a contact source, allowed channel, opt-out/DNC state,
   and last verification beside the property.
4. **Never drop the next touch.** A door-knock or call note should become a
   prepared task, draft, or appointment without retyping.
5. **Keep the existing system of record.** Forleads should enrich and write back
   to FUB/Gmail rather than demand migration.
6. **Know what setup unlocks.** `no result`, `no coverage`, `not configured`,
   `configured but unverified`, `provider failed`, and `no matching record` must
   be visibly different.

## Use cases

- Today's Territory Brief: rank objective new property events inside a farm and
  build a time-bounded route.
- Truth-Gap Waterfall: show sources attempted, misses, failures, cost, and the
  next paid or official lane.
- Contactability Passport: keep consent and channel eligibility with every
  person/property relationship.
- FUB Live Overlay: import people conservatively, attach property evidence,
  and write approved person-bound notes/tasks back. Calendar holds remain on
  the verified Google path until a separate FUB appointment route is reviewed.
- Porch Mode: capture outcome, voice note, photo, contact change, and next visit
  in seconds on mobile.
- Farm Table: properties by evidence, relationship, last touch, and next action,
  with every cell opening its provenance.
- Property Event Radar: watch objective permits, transfers, code cases, tax
  events, and listing changes without claiming predicted vulnerability.
- Broker-Ready Source Pack: explain provider data, permissions, cost, coverage,
  retention, and side effects for approval.
- Contradiction Resolver: preserve disagreement between assessor, deed, MLS, and
  paid data rather than choosing a hidden winner.
- Outcome Learning: recommend cadence and copy changes from edits, approvals,
  rejections, replies, appointments, and stages with inspectable evidence.

## Market evidence and limits

- NAR's 2025 Technology Survey reports that agents adopt technology primarily
  to save time (66%) and improve client experience (64%); 34% spent $50–250 per
  month on technology. This demonstrates budget and desired outcomes, not
  willingness to pay for Forleads.
  https://www.nar.realtor/research-and-statistics/research-reports/realtor-technology-survey
- Follow Up Boss is strong after a lead enters the CRM: routing, action plans,
  communication, smart lists, and reporting. Its own support workflow assumes
  external lead providers. Forleads should own the official-signal-to-CRM gap.
  https://help.followupboss.com/hc/en-us/articles/4420151624343-Lead-Sources-Websites-with-API-Integrations
- PropStream and BatchLeads are investor-first property/list/outreach systems.
  Forleads differentiates through licensed-agent farming, official provenance,
  field evidence, contactability, fair-housing restraint, and CRM overlay.
- Clay validates the table and waterfall mechanics, but it is horizontal.
  Forleads' domain moat is parcels, territory, official-record provenance,
  field work, consent/compliance, and approval-gated real-estate actions.

There is no proof of product-market fit yet. PMF requires retained paying agents
and verified outcomes; the design-partner thresholds live in
`.agent/plans/market-ready-us.md`.

## Nationwide and Oklahoma truth

The zero-setup national baseline is address/geographic context, OSM building
context where present, FEMA flood evidence where mapped, and operator-captured
evidence. Free uniform owner, deed, sale, mortgage, contact, and parcel depth
does not exist across every county.

Oklahoma is a named launch market. Oklahoma County's public ArcGIS parcel
service is the first implementation candidate. Tulsa requires a freshness and
records-use review. Oklahoma's statewide OGI parcel snapshot is view-only and
must not be silently ingested. A licensed national adapter such as Regrid can
provide standardized fallback after commercial terms, cost, storage, and cache
rules are approved. Assessor owner or mailing fields never establish contact
consent.

## Product language

Use agent outcomes: `Find the properties worth your next hour`, `See the proof`,
`Prepare the next touch`, `Approve where it lands`, `Keep your CRM`.

Avoid internal architecture on the first screen: `operator`, `scout swarm`,
`lead surface`, and `pipeline launch`. Keep those concepts in trace and support
surfaces where they help explain the system.
