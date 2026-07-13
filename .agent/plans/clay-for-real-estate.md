# Plan: Clay-for-real-estate

> Model-agnostic. Any agent (Sonnet/Haiku/Codex/Claude) picks up the next
> unshipped phase, reads the evidence line, ships one PR, and records the score.
> Capability rule: if you CANNOT do a step (watch a video, run a browser, fetch
> a URL), say so explicitly in your report and hand it to the human — the human
> can do what you can't. Silent skips are treated as fabrication.

## /goal (falsifiable)

An agent types any address in a built-in market and sees graded, sourced
evidence (sale, assessment, distress, flood) in under 10 seconds with ZERO env
setup; runs an enrichment waterfall over a 50-lead farm list where every hit
shows source + as-of date + grade; and every approved follow-up leaves from the
Action Inbox. Grade: built-in coverage claims A (live-verified endpoints);
waterfall cost target <$15/50 leads B (Clay's demonstrated $12/50, video
2026-07-11); 10-second target C (needs prod measurement).

## Evidence base

- User screenshots 2026-07-12: 22125 Clarksburg Road (Montgomery County, MD)
  shows "no source / date unknown / unverified" on sale + distress cards —
  the user's own market has zero built-in coverage.
- Live-verified 2026-07-12: Maryland SDAT `ed4q-f8tm` equality query returns
  the exact parcel (sold 2021-12-13 $658,120, assessed $777,333, built 2021)
  in ~1s; `$q` full-text TIMES OUT on this 2.4M-row dataset — equality only.
- Live-verified 2026-07-12: dataMontgomery `k9nj-z35d` housing code violations
  answers `$q=CLARKSBURG` with real rows (updated same day).
- Clay pattern source: "Claude Code + Clay Makes Lead Generation Actually Fun"
  (Nate Herk, 2026-07-11): plain-English goal prompt → waterfall enrichment
  (cascade providers, pay only on verified hit) → 50 enriched leads ≈ $12 →
  personalized email per row → campaign. Forleads equivalents: goal prompt →
  scout waterfall over catalog+env+paid providers → farm table → Action Inbox.

## Phases (one PR each, ordered by leverage ÷ cost)

1. **Maryland built-in pack + eq-query style** — new catalog style
   `socrata-eq` (equality on a configured address field, uppercase + suffix
   abbreviation, ISO date normalization); catalog entries for Maryland SDAT
   (sales + assessment, statewide bbox) and Montgomery County code violations
   (distress). User's market works with zero env. Status: SHIPPED (PR #49).
2. **Waterfall trace surface** — per-lead panel: which sources were tried,
   hit/miss, free/paid, grade; "run deeper scan" escalates to paid providers
   only on miss with cost estimate shown first. (Clay waterfall pattern.)
3. **Farm table** — tracked leads × evidence columns (Clay table-as-workflow);
   CSV farm-list import; bulk waterfall run; enriched CSV export.
4. **Goal-prompt front door** — plain-English goal composes a lead list + loop
   ("every pre-1980 house on my farm street with an open code violation").
5. **Connect screen productization** — real provider logos, guided per-source
   setup (exact env var, where to get the key, paste-and-test), "only a human
   can do these" checklist (paid keys, OAuth, MLS agreements).
6. **Per-screen use-case QA loop** — Map, Inbox, Loops, Pipeline, Report each
   grounded in a named agent job story; kill any control that doesn't serve
   one.

## Non-goals

Unchanged from product-completion-loop.md: no auto-send, no paid purchases,
no MLS scraping, no fake data (P1 no-mockups stance).

## Verification per phase

typecheck + lint + targeted vitest + `npm run agent:check -- --risk=<tier>`;
live curl proof for every new catalog endpoint (record URL + date in the
catalog `verified` field); prod probe after merge; screenshots for UI phases.
