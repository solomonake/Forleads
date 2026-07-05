# Plan: First-run activation + OAuth verification surfaces

> Model-agnostic. Everything a model needs is here.

**Goal:** A brand-new agent signing in for the first time is walked from
Connect Google → ground address → add contact → approve first draft, and every
surface (Map, Inbox, Loop Studio, Pipeline) links into the others; plus the
public /privacy and /terms pages Google requires before OAuth verification.

**Why / value:** Real clients are onboarding now. Empty surfaces read as dead
product; the checklist converts a cold workspace into visible progress. The
privacy/terms pages unblock Google OAuth verification (strangers can't sign in
until then).

**User / job:** A solo real-estate agent opening Forleads for the first time
and needing to reach their first approved draft without a demo.

**Pain evidence:** User screenshots showed Pipeline/Inbox looking dead — root
cause was zero leads (onboarding gap). Google OAuth consent screen is in
testing mode; verification requires homepage + privacy policy URLs.

**Current → desired behavior:**
- Now: no first-run guidance; Pipeline cards are not clickable to the map;
  Loop Studio "Run now" shows a transient text message only; no /privacy or
  /terms routes.
- After: floating Getting-started checklist (4 steps, live state, dismissible);
  Pipeline cards fly to their lead on the map; Loop Studio run results are a
  persistent banner with a jump to Action Inbox; /privacy and /terms exist and
  are linked from the signed-out home surface.

**Non-goals:** No new backend routes; no schema changes; no auto-send; no
Google Console clicks (human does console steps with provided text).

**Risk tier:** medium — normal product behavior, read-only API consumption,
two static pages. No auth/persistence changes.

**Seams & exact files:**
- `src/components/GettingStarted.tsx` (new) — reads /api/auth/session,
  /api/leads, /api/inbox; localStorage dismissal.
- `src/app/page.tsx` — mount checklist; pass onNavigate to LoopStudio.
- `src/components/MapWorkspace.tsx` — `forleads:open-lead` CustomEvent
  listener → goTo(detail).
- `src/components/Pipeline.tsx` — card button dispatches the event + navigates.
- `src/components/LoopStudio.tsx` — onNavigate prop, persistent run-result
  banner with inbox CTA.
- `src/app/privacy/page.tsx`, `src/app/terms/page.tsx` (new, static).
- `src/app/globals.css` — checklist + banner styles.

**Acceptance scenarios:** empty workspace shows checklist step 1; signed-in
user sees step 1 done; grounding a lead completes step 2; pipeline card click
lands on the map lead; Run now with no lead shows guidance; /privacy renders
without auth.

**Break plan:** APIs 401 when signed out (checklist must not crash — treat as
step 1 pending); malformed open-lead event detail ignored; localStorage
unavailable (SSR guard).

**Verification evidence:** `npm run agent:check -- --risk=medium`; Playwright
video of the first-run walk for the PR.

**Human-in-the-loop:** Google Cloud Console: set publishing status to
In production + submit verification with the URLs/justification in the PR body.

**Done criteria:** checks green; video recorded; PR drafted with console
instructions; no naked numbers; honest empty states preserved.
