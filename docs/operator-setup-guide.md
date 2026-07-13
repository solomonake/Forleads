# Operator setup guide — what loads by itself, and what only you can unlock

Forleads is fail-closed: a card says `setup required` when the source needs a
credential or feed URL that only the operator can provide. Nothing is broken —
the app refuses to fake data it doesn't have. This guide is the complete list,
grouped by who can act.

## Loads with ZERO setup (built-in, live-verified)

| Market | What you get |
|---|---|
| Maryland (statewide) | SDAT sale records + assessments (sale price, transfer date, assessed value, year built) |
| Montgomery County, MD | Housing code violations |
| New York City | Rolling sales + HPD housing violations |
| Philadelphia | OPA sales + L&I code violations |
| Chicago | Building violations |
| United States | FEMA flood zones |
| Calgary, Edmonton, Winnipeg, Vancouver | Property assessments |
| England & Wales | HM Land Registry price paid, EA flood zones |
| France | DVF sale records |
| Everywhere | OpenStreetMap buildings, Nominatim address search, Mapillary street imagery |

## You must do these (Forleads can't) — ordered by payoff

Each is a Vercel env var: **Vercel → forleads → Settings → Environment
Variables → add for Production → redeploy.**

1. **Google Workspace / Microsoft 365 (outreach hero path)** — no env var:
   click **Connect** in the Connector Hub and finish OAuth. Drafts then land in
   your real Gmail/Outlook.
2. **CRM** — Follow Up Boss: Admin → API → New API key → paste in Connector
   Hub. GoHighLevel: Location → Settings → API key + Location ID.
3. **Twilio SMS** — Account SID, Auth Token, From number from the Twilio
   console → Connector Hub.
4. **ATTOM** (`ATTOM_API_KEY`) — paid; apply at api.developer.attom.com.
   Unlocks US parcel/assessor/deed/valuation nationally.
5. **Regrid** (`REGRID_API_KEY`) — paid; parcels + zoning.
   **ReportAll** (`REPORTALL_API_KEY`) — paid parcel alternative.
6. **RentCast** (`RENTCAST_API_KEY`) — free tier exists; rental estimates +
   comps context.
7. **MLS** (`RESO_WEB_API_URL` + `RESO_ACCESS_TOKEN`, or `MLS_GRID_URL` +
   `MLS_GRID_ACCESS_TOKEN`) — requires your broker/MLS data agreement; no
   shortcut exists, and Forleads will not scrape MLS data.
8. **Google Street View** (`GOOGLE_MAPS_API_KEY`) — needs a Google Cloud
   project with billing; Mapillary already covers imagery for free where
   coverage exists.
9. **Automation bridge** (`N8N_WEBHOOK_URL` or `ZAPIER_WEBHOOK_URL`) — any
   webhook receiver you run.

## Free public feeds — an agent can wire these for you

Any URL-shaped source (`TAX_DELINQUENCY_DATA_URL`, `CODE_VIOLATION_DATA_URL`,
`VACANT_REGISTRY_DATA_URL`, `PLANNING_GIS_URL`, county assessor/recorder URLs)
accepts a public open-data endpoint. Better: ask the agent to add your market
to the **built-in catalog** (`src/lib/providers/catalog.ts`) — catalog sources
query per-address at request time (static env dumps only match whatever slice
the URL captured) and must be live-verified with a real address before they
ship. That's how Maryland was added; any Socrata/CARTO/ArcGIS market works the
same way.
