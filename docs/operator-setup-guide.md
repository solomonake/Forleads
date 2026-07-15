# Operator setup guide — what works now, what is blocked, and who acts

Forleads is fail-closed. A credential is not proof that a capability works, and
a public owner record is not proof that outreach is allowed. The Connect screen
uses these states:

- **live** — this exact adapter path is implemented; built-in sources have a
  recorded live probe, while credentialed connectors still need a per-account
  test.
- **setup required** — the adapter exists and an operator/user action can unlock
  it now.
- **manual capture** — an agent can supply first-party evidence or a consented
  contact.
- **planned** — no working adapter exists yet. Do not buy a key for Forleads.

## Zero setup — built in and live-verified

| Market | Available evidence |
|---|---|
| Maryland | statewide sale records and assessments |
| Montgomery County, MD | housing code violations |
| Connecticut | statewide recorded sales |
| New York State | statewide assessments |
| New York City | rolling sales and HPD violations |
| Philadelphia | OPA property/sale records and L&I violations |
| Chicago | building violations |
| New Orleans | code violations |
| Cincinnati | code enforcement cases |
| Oklahoma County, OK | parcel-point current market assessment and valid recorded sale facts |
| United States | FEMA flood-zone context; OSM building/address context where present |
| Selected Canadian cities | official assessment records |
| England and Wales | HM Land Registry price-paid and EA flood layers |
| France | DVF sale records |
| Global floor | OSM buildings, address search, and Mapillary where coverage exists |

This is not uniform national parcel, sale, deed, owner, contact, or MLS depth.
Oklahoma County is live only inside the published county parcel-layer extent;
the rest of Oklahoma retains the national FEMA/OSM floor. The county adapter
queries the requested point and retrieves situs address, current market
assessment, valid sale price, and recorded date only. It deliberately does not
retrieve public owner or mailing fields, and the parcel service never proves
contact consent. The ArcGIS item reported a July 8, 2026 data refresh and no
special usage restrictions when re-verified July 15, 2026; bulk use still needs
an operator terms review.

## Setup now — implemented paths

### Contactability passport (no external account)

1. Ground a property and open its lead rail.
2. Add a **known contact** only from an agent-known, first-party, connected-CRM,
   or otherwise documented relationship. Do not copy assessor ownership into a
   contact record.
3. Record the relationship source and source detail.
4. Mark email, SMS, and call permission independently. A saved phone number
   remains `permission unknown` until a relationship basis is recorded; SMS
   drafting fails closed until it is explicitly allowed.
5. Save the passport. Forleads records the server verification time, preserves
   opt-outs, and shows channel state beside the property and on Deals.

Re-check the passport when a contact changes, a CRM import refreshes, or the
person opts out. Saving a record documents the check; it never creates consent.

### Google Workspace: Gmail drafts and Calendar events

Owner/admin:

1. Create or select a Google Cloud project.
2. Enable Gmail API and Google Calendar API.
3. Configure the OAuth consent screen.
4. Add the minimum scopes `gmail.compose` and `calendar.events`.
5. Create a Web OAuth client.
6. Register both callback URLs exactly:
   `http://localhost:3000/api/auth/google/callback` and
   `https://forleads.vercel.app/api/auth/google/callback`.
7. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_REDIRECT_URI`, and a strong `SESSION_SECRET` to the correct Vercel
   environment, then redeploy with approval.

Each agent:

1. Open **Connect**.
2. Choose Google and complete OAuth.
3. Run the connector test.
4. Approve one test draft and calendar event; confirm both in the real account.

### Google Street View imagery

1. Create/select a Google Cloud project with billing.
2. Enable Street View Static API.
3. Restrict the server key to the API and deployment egress policy.
4. Add `GOOGLE_MAPS_API_KEY` and set
   `FORLEADS_IMAGERY_PROVIDER=google-street-view`.
5. Redeploy with approval and verify one real address. Keep Mapillary as the
   free fallback where coverage exists.

### Generic open sale, distress, and hazard feeds

Implemented generic inputs include `OPEN_SALES_DATA_URL(S)`,
`COUNTY_OPEN_DATA_URL`, `TAX_DELINQUENCY_DATA_URL`,
`CODE_VIOLATION_DATA_URL`, `VACANT_REGISTRY_DATA_URL`, and
`OPEN_HAZARD_LAYER_URL`. A feed must match the implemented schema or receive a
built-in catalog mapping. Prefer adding a tested entry in
`src/lib/providers/catalog.ts`: query a real address first, record license,
coverage, and verification date, then add unit and live tests.

### Zapier-compatible outbound webhook

`ZAPIER_WEBHOOK_URL` is the implemented approval-gated outbound bridge. Treat
it as single-environment until tenant-bound credentials and routing ship.
`N8N_WEBHOOK_URL` alone is not wired. Do not enable multi-tenant inbound Zapier
until its global demo-tenant routing is replaced.

## Blocked — do not collect credentials yet

### Microsoft 365

The draft/calendar adapter exists, but refreshed Microsoft tokens are not yet
persisted. Do not onboard users until that defect and reconnect tests are
closed. When unblocked, the callback is
`/api/auth/microsoft/callback` (not `/api/connectors/microsoft/callback`).

### Follow Up Boss and GoHighLevel

Do not request customer keys yet. Current contact sync does not persist people,
and note/task calls do not bind the required provider contact id. The unlock is
implementation first: import/upsert contacts, store provider ids, bind every
write to the right person, and pass identity/pagination/duplicate/401/429 tests.

### Twilio SMS

Do not enable production SMS. A phone number is not consent. The product first
needs durable consent proof, DNC/STOP and revocation handling, quiet hours,
sender/campaign scope, A2P readiness, and delivery callbacks. After those ship,
the owner completes Twilio business/A2P registration and legal review before
adding tenant credentials.

### ATTOM, Regrid, RentCast, ReportAll, RESO, and MLS Grid

These cards are planned adapters. Today, keys only produce grade-D mapping gaps;
they do not return provider facts. Do not purchase access for Forleads yet.
Implementation order is Regrid parcel facts, then RentCast clearly labeled
estimates/comps, then an authorized MLS lane. Before any purchase: review terms
for caching, storage, display, redistribution, derived data, quota, and cost;
implement the adapter and contract tests; then add the key and verify Oklahoma
plus representative addresses from every U.S. Census region.

## Production foundations already configured

The 2026-07-15 read-only health probe reported Supabase persistence, live agent
reasoning, Nominatim geocoding, open-data property mode, Mapillary configuration,
production mock connector writes disabled, and no live-mode policy violation.
That proves configuration posture, not address coverage or third-party writes.
Re-run `/api/health` after every deployment and keep exact external write proof
separate from health mode.
