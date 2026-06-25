# Learnings — 2026-06-25 night grind (7 PRs)

Repo-scoped technical learnings from shipping #16-#22 in one session. The
session-scoped behavioral observations live in `~/.claude/.../memory/token-waste-learnings-2026-06-25.md`.

## Patterns that worked

### Best-effort persistence for memory writes

Wrapping `persistOutcomeMemory` / `persistNeighborhoodMemory` in `try/catch`
that returns `null` on any failure (embedder hiccup, DB unreachable, etc.)
makes the human-gate path robust without sacrificing accountability. The
event emit downstream is guarded by `if (mem)` so a missed write doesn't
emit a phantom `outcome.recorded`. Apply this pattern to ANY future memory
writer.

### Surface form discipline

Memory rows always start with `[<kind/tag>/<grade>] …` (evidence, outcome,
neighborhood). This lets downstream code parse the row WITHOUT a separate
field — `recallOutcomes(actionType)` filters by `text.includes("] " + actionType + ":")`,
`dispatcher v2` parses sibling scout types with `/^\[([a-z]+)\/([A-D])\]/`.
Don't break this format. If you add a new memory kind, follow the same
bracket convention.

### Scout cards need stable ids

`scouts.stamp()` originally set scout + created_at but NOT an id. This broke
ANY downstream code wanting to point back at a card (the recalled-mem chip
in PR #18 surfaced this). Fix was a one-line `id: c.id ?? uuid()` in stamp.
If you find yourself wanting to reference a card from a Memory row's `ref`
or from anywhere else, the id is now guaranteed.

### Repository methods compose

Adding `recallNeighborhood(agentId, h3Index, k)` was a simple in-memory
table scan + filter + sort. No need for embeddings — every match is on-cell
by construction. Similarity score = 1. This is a different shape than
`recallMemories(leadId, query, k)` which DOES need embeddings. Don't conflate
the two: lead-scoped semantic recall (needs embedder) vs. cell-scoped exact
recall (doesn't).

## Patterns that didn't (and how I worked around them)

### Branch switches in the worktree are expensive

Every `git checkout` triggered system reminders dumping unchanged file
contents. ~250 tokens per switch × 8 switches = ~20k tokens of pure noise.
For long sessions: plan the branch graph up front. Stack related PRs on
their parent branches (`gh pr create --base feat/v1`). When you MUST switch,
expect the noise and don't re-read the same files.

### `vitest run <file>` is slower than `npm test`

This project's vitest takes ~80s wall time per-file run vs ~10s for the full
suite. The transform/setup cost isn't amortized in single-file mode.
**Always** `npm test --silent` for verification.

### Markdown conflict resolution in stashed merges

`git stash pop` on an overlapping branch generates `<<<<<<<` markers. Don't
panic — just Edit them out (keep the desired side). Faster than re-doing
the work from a clean branch.

## File-by-file gotchas (from this session)

- **src/lib/pipeline.ts** — when adding a feature that needs prior memory
  context, hoist the recall call to the TOP of runSwarm before
  planDispatch. The dispatcher needs the data to decide what scouts to
  run. Bad ordering = dispatch happens with stale/no context, recall is
  redundant.
- **src/lib/agents/composer.ts** — the deterministic path is
  template-only; the live path is Claude-via-JSON. ANY new compose-time
  context (priorOutcomes, etc.) needs to be threaded into BOTH paths.
  Deterministic = template branch in `compose()`; live = `liveSystem()`.
- **src/components/MapWorkspace.tsx** — the toast state was a `string`;
  upgrading it to a polymorphic `{kind, text, requestId?, retry?}` was a
  4-site refactor (3 catch blocks + the JSX). Worth doing the whole
  refactor in one PR; piecemeal is worse.
- **src/lib/db/repository.ts vs supabase-repo.ts** — these implement the
  same `Repository` interface. Any new method needs BOTH implementations
  AND a corresponding row mapping in supabase-repo (the `xToRow` /
  `xFromRow` pair). Forgetting the Supabase side = tsc passes but prod
  breaks.

## Open follow-ups (for next session to consider)

- A Supabase migration adding `memory.h3_index` column + index — currently
  the supabase-repo references it but the schema doesn't have it. In-memory
  works for development but prod-Supabase will silently drop the field.
- A dispatcher v3 that uses neighborhood prior confidence to TIGHTEN
  budgets instead of fully skipping a scout. Binary skip is heavy-handed
  for grade-B coverage.
- A composer trace that shows WHICH outcome triggered the `-postreject`
  rotation (not just "1 rejected" — show the actual rejection reason).
