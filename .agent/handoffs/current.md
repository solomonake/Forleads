# Current agent checkpoint

Generated: 2026-07-12 (Clay-for-real-estate session)

## State
- Branch: `codex/maryland-builtin-pack`
- Base: main (codex/operator-ux-evidence-review already merged per GitHub; local origin/main ref was stale and `git fetch` timed out — trust `gh`, not local refs, on this machine)

## Goal
Phase 1 of `.agent/plans/clay-for-real-estate.md`: Maryland built-in pack +
`socrata-eq` catalog style so the user's own market (22125 Clarksburg Road,
Montgomery County, MD) grounds sale/assessment/distress evidence with zero env.

## Completed
- Root cause of "nothing loads at my address": env feeds are static
  pre-filtered dumps; only catalog sources query per-address. User's market had
  no catalog coverage.
- Added `socrata-eq` style (equality on cfg.queryField, UPPERCASE + USPS
  suffix variants, dot-date → ISO normalization), Maryland SDAT sales +
  assessments entries, Montgomery County code violations entry.
- Live-verified 2026-07-12 by direct curl: SDAT equality returns the exact
  Clarksburg parcel (sale 2021-12-13 $658,120, assessed $777,333) in ~1s; $q
  times out on 2.4M rows. Montgomery k9nj-z35d answers $q with fresh rows.
- 14/14 catalog unit tests pass (3 new: eq-query shape, suffix fallback,
  Montgomery distress).
- docs/operator-setup-guide.md: what loads built-in vs what only the human can
  unlock (OAuth, paid keys, MLS agreements).
- .agent/playbook.md: capability-gaps-are-handoffs P1 rule + market-pack
  recipe.

## Next exact action
When `LIVE_CATALOG=1 npx vitest run src/lib/providers/catalog.live.test.ts`
+ typecheck + lint finish green: commit, push, `gh pr create`, then continue
plan Phase 2 (waterfall trace surface) or hand off.

## Blockers
- `git fetch` can take >2min on this machine (timed out once); GitHub API is
  the source of truth for merge state.
- YouTube transcript extraction is anti-bot-blocked; video patterns were
  captured from description + chapters instead (recorded in the plan).

## Authority
Read/edit/test/branch/commit/push/PR allowed; merge, deploy, secrets, spend,
external comms are human-gated.

## Cold-start sequence
1. Read `AGENTS.md`, `.agent/AGENT_OS.md`, this checkpoint, and
   `.agent/plans/clay-for-real-estate.md`.
2. Verify branch + `git log --oneline -3`.
3. Re-run the cheapest risky proof: the SDAT curl from the plan's evidence
   line.
4. Continue from **Next exact action**.
