# Plan: Evidence Source Freshness

**Goal:** Make evidence source dates machine-checkable and visible so stale/future data cannot look current.

**Why / value:** Real estate agents need to know whether a fact came from a current feed, an old sale event, or an undated source. Arden's concern is not just fake data; it is data that looks grounded while hiding weak provenance.

**User / job:** An agent opens a property evidence card and can see source names plus freshness status without needing to inspect raw JSON.

**Pain evidence:** Evidence validation enforces source presence but does not reject impossible future `as_of` dates or surface stale/undated source status in the main map evidence card.

**Current -> desired behavior:** Current non-D evidence can carry malformed/future source dates and the UI only shows source names. Desired behavior: malformed/future source dates are rejected; visible source metadata labels evidence as `as of`, `stale`, or `date unknown`.

**Non-goals:** Do not change provider credentials, buy data, or claim all public records are current. Historical sale records remain valid historical facts, but their date should be visible.

**Risk tier:** medium/high because evidence validation affects facts agents may rely on.

**Context links:** `src/lib/evidence/validate.ts`, `src/components/MapWorkspace.tsx`, `.agent/phase-manifest.json`.

**Seams & exact files:** Add pure freshness helpers in `src/lib/evidence/freshness.ts`, wire validation in `src/lib/evidence/validate.ts`, render badges in `src/components/MapWorkspace.tsx`, style in `src/app/globals.css`, and cover with tests.

**Acceptance scenarios:** Valid dated source passes and shows `as of YYYY-MM-DD`. Future or malformed `as_of` rejects the card. Old dated source shows stale status. Undated non-D source shows date unknown rather than pretending freshness.

**Break plan:** Future dates, invalid dates, YYYY-MM dates, mixed dated/undated sources, D gaps, stale imagery, and source arrays with no names.

**Verification evidence:** Focused freshness/validation tests, typecheck, lint, and high-risk gate.

**Done criteria:** Evidence freshness is validated, rendered, tested, and recorded in the loop checkpoint/scorecard.
