# Plan: Real Data Source Expansion

**Goal:** Give Forleads a production data roadmap with at least 20 legitimate source lanes, and implement the first live image lane so property imagery renders as real media instead of URLs or fake placeholders.

**Why / value:** Real estate agents will trust the tool only if every property fact, price, image, risk signal, and contact claim is grounded in a lawful source or shown as an explicit gap.

**User / job:** A real estate agent types a location, opens a property, and needs the best available facts and photos without hallucinated records or fake images.

**Pain evidence:** The user asked for real, up-to-date property facts and actual property images. Prior architecture already had OSM, Nominatim, Mapillary, open sales feeds, evidence validation, and provider readiness, but the source catalog was too small and Google Street View imagery was not available as a real adapter.

**Current -> desired behavior:** Current source readiness lists a handful of broad packs. Desired behavior: the Connector Hub explains at least 20 concrete source lanes, each with honest live/setup/planned/manual-capture status. Imagery scouts should render actual property image media when Mapillary or Google Street View is legally configured, otherwise return grade-D gaps.

**Non-goals:** Do not buy data, add secrets, deploy, scrape copyrighted sites, show fake photos, or represent OSM/open data as MLS/assessor truth.

**Risk tier:** high, because this touches data truth, imagery licensing, paid-provider boundaries, and what real agents may rely on.

**Context links:** `.agent/playbook.md`, `docs/Forleads_Research_v1.md`, `docs/Forleads_MapGIS_v1.md`, `src/lib/providers/readiness.ts`, `src/lib/providers/real.ts`, `src/lib/providers/index.ts`, `src/components/ConnectorHub.tsx`.

**Source lanes:**
1. OpenStreetMap / Overpass building tags.
2. Self-hosted Nominatim.
3. Photon autocomplete.
4. OpenAddresses.
5. US Census TIGER/Line.
6. Mapillary street imagery.
7. Google Street View Static API.
8. Agent-captured field photos.
9. RESO Web API / MLS authorized listing data.
10. MLS Grid authorized listing/media feed.
11. ATTOM Property Data API.
12. RentCast API.
13. Regrid parcel API.
14. ReportAll parcel API.
15. HM Land Registry Price Paid Data.
16. County assessor open-data feeds.
17. County recorder / deed feeds.
18. Socrata municipal open-data portals.
19. FEMA NFHL flood layers.
20. Local planning/zoning GIS layers.
21. Tax delinquency public records.
22. Code violation public records.
23. Vacant property registry records.
24. Microsoft Global ML Building Footprints.
25. Google Open Buildings.
26. Operator/imported CSV proof packs.

**Steps:**
1. Expand source readiness into a 20+ source catalog grouped by map/address, imagery, listings/media, sales/parcels/comps, risk/distress, global buildings, and operator-owned data.
2. Add Google Street View Static API as a real imagery provider behind `GOOGLE_MAPS_API_KEY` / `FORLEADS_IMAGERY_PROVIDER=google-street-view`.
3. Use Google metadata first, then return a real image URL as evidence media only when status is `OK`.
4. Update the imagery allowlist so Google imagery is accepted by the scout contract.
5. Add focused tests for Google Street View media and no-imagery grade-D gaps.
6. Add configured public assessor/property feeds to the property scout so year built, building area, land area, use code, and parcel id can appear as sourced cards when a real feed exists.

**Acceptance scenarios:** Happy: configured Google Street View returns an imagery evidence card with image media and capture/copyright metadata. Empty: zero results returns a grade-D gap. Failure: missing key is setup-required and no fake image appears. UI: Connector Hub shows at least 20 legible source lanes.

**Break plan:** Invalid coordinates, no Google results, request denied, missing key, Mapillary missing thumbnails, source outside allowlist, and paid provider not configured.

**Verification evidence:** Run provider tests plus a lightweight TypeScript parse probe if full gates stall. `npm run agent:doctor` remains the minimum repo-operating proof.

**Human-in-the-loop:** Google Maps API key/billing, MLS/RESO contracts, ATTOM/Regrid/RentCast credentials, and production deployment require the user.

**Done criteria:** The app has a visible 20+ source plan, Google Street View can render real images when configured, configured assessor/property feeds can add real property facts, and unconfigured sources stay honest rather than fake.
