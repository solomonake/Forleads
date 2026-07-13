# Current agent checkpoint

Generated: 2026-07-13 (Clay-for-real-estate session, loop 2)

## State
- Branch: `codex/product-language` (stacked on merged #51)
- Merged this session: PR #50 (Maryland pack), PR #51 (CT + NY statewide, NOLA
  + Cincinnati violations, catalog-probe script). Merge authority: GRANTED by
  user 2026-07-13 ("you can push, merge and etc").

## Goal
Transform Forleads from a developer-looking tool into a product agents
instantly understand and prefer over FUB. User verdict 2026-07-13: "currently
this is a very useless and unusable tool… I don't even see a use for it if
someone is already using FUB." Positioning answer: FUB manages contacts you
already have; Forleads finds/grounds opportunities from public records and
WRITES INTO your FUB/Gmail/calendar after approval.

## Completed (this branch, gates running)
- ReviewTray: task/calendar/SMS/CRM payloads render as human cards
  (PayloadCard) — raw JSON eliminated.
- AgentTraceDrawer: leads with a one-paragraph plain-English story
  (traceStory); rows renamed (What started this / Grounded on / Safety
  checks / Where it goes / What it cost); zero-cost runs say "Nothing".
- ActionInbox: evidence chips now carry claim labels (+N more), not bare
  grade dots.
- Nav story: Prospect / Approvals / Autopilot / Deals / Connect / Recap
  (titles kept for test selectors); every screen h1+sub rewritten in agent
  language with honest-FOMO framing.

## Next exact actions (in order)
1. When gates pass: commit, push, PR "Product language: every screen speaks
   agent, not developer", merge on green CI.
2. **Contacts-forward pass** (user: "other tools have the people's contacts
   immediately pulled up"): lead rail + Deals rows surface the consented
   contact (name/phone/email) at top; add-contact affordance; FUB
   syncContacts when connected. Files: MapWorkspace.tsx, Pipeline.tsx,
   ContactEditor.tsx, connectors/followupboss.ts.
3. **Provider logos** on Connect cards (inline SVG monograms in brand colors
   — no external fetches; nominative use).
4. **Batch approvals** (approve/skip/edit cadence in Approvals).
5. **Farm table** (Clay-style: leads × evidence columns, CSV import/export)
   per .agent/plans/clay-for-real-estate.md Phase 3.
6. US coverage keeps growing via scripts/catalog-probe.mjs (recipe in
   .agent/playbook.md); then Canada provinces, Europe countries.

## Blockers / human-only
- OAuth connect clicks, CRM/Twilio keys, paid data keys, MLS agreements
  (docs/operator-setup-guide.md).
- Rendered browser QA at 390px on this 8GB machine is unreliable under load;
  Vercel preview + prod check after merge instead.

## Verification proof so far
- #51: unit 36/36, LIVE_CATALOG 16/16, full CI green, merged.
- This branch: typecheck/lint/component tests running (see phase-runs.jsonl).

## Cold-start sequence
1. Read AGENTS.md, this file, .agent/plans/clay-for-real-estate.md,
   .agent/plans/screen-use-cases.md.
2. `git log --oneline -5` on codex/product-language.
3. Continue from Next exact actions.
