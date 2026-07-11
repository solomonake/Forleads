# Plan: Property Provenance Hardening

**Goal:** Make property/sales/imagery evidence harder to spoof and more useful by carrying source freshness, source URL trust, and actual property image media when the imagery provider has it.

**Why / value:** Real estate agents must not see fake prices, fake sources, or text-only imagery claims when Forleads is meant to guide real-world action.

**User / job:** A real estate agent taps a property and needs defensible facts, sale context, and images they can inspect before deciding what to do.

**Pain evidence:** External feedback asked what prevents a provider from being called with hallucinated-looking arguments before the validation layer. Current `EvidenceCard` validation catches naked numbers, but open sales rows can still pass through weak source/date metadata and Mapillary only returns a frame count.

**Current -> desired behavior:** Open sale records currently become cards if address matching succeeds. Desired: the provider ignores invalid/future sale dates, does not trust arbitrary row-level source URLs, includes `as_of` freshness, and returns an honest D gap when records look untrustworthy. Imagery currently says "N frames"; desired: imagery evidence can carry actual image thumbnails with attribution/capture dates.

**Non-goals:** This does not add MLS/ATTOM/paid provider integrations, production credentials, bulk image storage, or external email replies.

**Risk tier:** high, because provider evidence affects trust, compliance, and production data claims.

**Context links:** `AGENTS.md`, `.agent/AGENT_OS.md`, `.agent/playbook.md`, `.agent/decisions.md`, `.agent/handoffs/current.md`, `src/lib/providers/real.ts`, `src/lib/providers/real.test.ts`, `src/lib/evidence/validate.ts`, `src/components/MapWorkspace.tsx`.

**Seams & exact files:** `EvidenceCard` type in `src/lib/core/types.ts`; open-data and Mapillary providers in `src/lib/providers/real.ts`; provider tests in `src/lib/providers/real.test.ts`; scout allowlists in `src/lib/agents/dispatcher.ts`; lead evidence UI in `src/components/MapWorkspace.tsx`; card styling in `src/app/globals.css`.

**Steps:**
1. Extend `EvidenceCard` with optional media metadata.
2. Harden open sales record conversion: source URL allow/fallback, source `as_of`, invalid/future date filtering, and honest gap when matched rows are unusable.
3. Return Mapillary thumbnails/capture dates as media on imagery cards.
4. Render media thumbnails under evidence cards without disrupting grade/source display.
5. Add focused tests for source fallback, future-date rejection, freshness metadata, and Mapillary media.

**Acceptance scenarios:** Happy: a county feed match returns sale value with source and `as_of`. Empty: no feed or no match returns D gap. Failure: invalid future-dated/hallucinated record is rejected. Recovery: imagery still returns a D gap when Mapillary has no frames. Responsive: evidence card layout remains stable with 1-3 images.

**Break plan:** Malformed source URLs, arbitrary third-party row URLs, future dates, missing price/date, missing Mapillary token response fields, and no imagery frames.

**Verification evidence:** Run focused provider tests and the evidence/UI-safe targeted tests. Treat `agent:doctor`, typecheck, lint, and full gates as red/inconclusive if they stall.

**Cost / context budget:** No paid calls. Tests mock all network requests.

**Risks / gotchas:** Do not claim sales provider completeness. OSM/Mapillary coverage varies; grade D gaps are acceptable. Public Nominatim/OSM services require attribution and fair-use behavior.

**Human-in-the-loop:** Production provider keys, paid MLS/ATTOM access, deployment, and external email reply remain user-approved.

**Done criteria:** Tests prove spoof-resistant source behavior and media payloads; UI can display images; checkpoint records proof and remaining production data-source gaps.
