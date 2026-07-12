# Plan: Operator Property Media Ingestion

**Goal:** Render agent-owned or licensed property photos as real evidence media when a configured manifest matches the selected property.

**Why / value:** Real estate agents need actual property images, but Forleads must never invent or scrape photos. First-party/operator media is the most trustworthy current-condition lane when legal street or MLS imagery is missing.

**User / job:** An agent types an address, opens the evidence panel, and sees the best available lawful images with source, freshness, and attribution.

**Pain evidence:** The user explicitly asked for real images instead of URLs or fake placeholders, and the current readiness row mentions field photos without a live provider path.

**Current -> desired behavior:** Current imagery comes from Mapillary or Google Street View when configured, otherwise mock/dev imagery can appear in non-production. Desired behavior: configured operator-owned media manifests return image media cards first; missing matches produce an explicit gap; Mapillary/Google still run as fallback/secondary imagery.

**Non-goals:** Do not buy data, upload files to storage, add secrets, scrape MLS/media sites, or guarantee photos for every property.

**Risk tier:** high, because this controls what visual evidence real agents may rely on.

**Context links:** `.agent/phase-manifest.json`, `.agent/plans/real-data-source-expansion.md`, `docs/Forleads_MapGIS_v1.md`, `src/lib/providers/real.ts`, `src/components/MapWorkspace.tsx`.

**Seams & exact files:** Implement `ImageryProvider` composition in `src/lib/providers/real.ts` and factory wiring in `src/lib/providers/index.ts`; source readiness in `src/lib/providers/readiness.ts`; tests in `src/lib/providers/real.test.ts` and `readiness.test.ts`.

**Steps:**
1. Add an operator media imagery provider that reads JSON/CSV-like manifests from `OPERATOR_PROPERTY_MEDIA_URL`, `FIELD_PHOTO_MANIFEST_URL`, or `NEXT_PUBLIC_FIELD_PHOTOS`.
2. Match media by normalized address or near coordinates, require a usable image URL and explicit rights/license text, and surface only image evidence cards.
3. Compose operator media with Mapillary/Google/no-street-provider fallback so missing field photos remain honest without blocking other imagery.
4. Update readiness details and tests.
5. Run focused provider tests, typecheck, lint, then the high-risk gate before PR.

**Acceptance scenarios:** Happy: a matching manifest row renders an actual `<img>` media card with captured date and attribution. Empty: no matching first-party photo returns a grade-D field-photo gap and still shows Mapillary/Google/no-street fallback. Failure: an unreachable manifest returns a grade-D setup gap and still preserves fallback imagery. Abuse: rows without rights/license or valid media URL are not displayed.

**Break plan:** Malformed manifest, bad coordinates, missing address, relative/invalid image URL, rows with no rights, stale/future dates, and base imagery provider failure.

**Verification evidence:** `npm run typecheck`, `npm run lint`, focused provider/readiness Vitest, then `npm run agent:check -- --risk=high`.

**Cost / context budget:** No paid calls and no new secrets. Network calls only occur when the operator configures a manifest URL.

**Risks / gotchas:** A manifest can still contain stale or misleading photos; Forleads labels them as operator-provided evidence, not proof of current condition. Browser CORS for direct images depends on the storage provider; a future proxy/storage lane may be needed for locked buckets.

**Human-in-the-loop:** Operators must provide a manifest URL and confirm they have rights to display the media.

**Done criteria:** Operator media cards display real image media, gaps are explicit, no fake imagery is introduced, and high-risk gates pass.
