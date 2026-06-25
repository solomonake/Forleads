# Handoff template — write the next session a runway, not a riddle

Copy this, fill it, drop it as the first message of a new session (or commit it as
`.agent/handoffs/<date>-<topic>.md` so any agent can pick it up cold). The goal:
the next agent acts in minutes, not after 20 minutes of rediscovery.

Keep it tight. A good handoff is ~40 lines, not a novel.

Prefer generating the live checkpoint with:

```bash
npm run agent:checkpoint -- \
  --goal="<observable done state>" \
  --completed="<verified work>" \
  --next="<one exact action>" \
  --blockers="<known blocker or none>" \
  --proof="<commands, PR, deploy, request IDs>"
```

---

## STATE
- **Branch:** `<branch>` · **PR:** `#<n>` (`<open/merged>`)
- **Green:** `<what passes — e.g. typecheck/lint/38 tests, Vercel preview>`
- **Broken / blocked:** `<known failures, flaky gates, BLOCKED merges, half-done work>`
  - ⚠️ Include broken *governance*, not just broken code (e.g. "the ruleset blocks
    merges until X"). The #1 time-sink is discovering a blocker that was already known.

## GOAL + DEFINITION OF DONE
- **Goal:** `<one sentence>`
- **Done when (checkable):** `<e.g. "live X merged to main, prod deploy green, playbook updated">`
  - Not "continue developing." A checkbox lets the agent stop cleanly instead of guessing scope.

## AUTHORITY (what you may do WITHOUT asking)
- Merge: `<yes/no — which PRs>` · Edit CI/rulesets: `<yes/no>` · Admin-bypass: `<yes/no>`
- Install deps / MCPs: `<yes/no>` · Touch prod env: `<yes/no — or "human only">`
- Spend (API/data): `<budget posture — e.g. "keep cost ≈ $0, cheap models for drafts">`
  - Tell the agent what it's allowed to change, not just what to build. Removes round-trips.

## POINTERS (so nothing is inferred)
- **Plan file:** `<.agent/plans/x.md>` · **Skill to read first:** `<name>`
- **IDs/creds:** `<Vercel org=…, project=…; Supabase project ref=…; which MCPs are connected>`
- **Source of truth:** `<docs/ , CLAUDE.md , constitution>`

## STANDING RULES
- When you fail: ask a sharp question, learn, write it to `.agent/playbook.md` + memory, enforce it next time.
- Push code only on a branch that passes all local gates you can run.
- Branch → green CI/CodeQL → best-practice review → merge → review the prod build (errors/warnings/logs) → reason through them.
- No naked numbers; human approves outward actions; degrade gracefully.

---

### Why each field exists (lessons paid for)
1. **STATE/broken** — hand off known-broken governance, not just known-good code.
2. **AUTHORITY** — "do the merges" authorizes merging; a ruleset rewrite is heavier. Say the boundary.
3. **DEFINITION OF DONE** — open-ended scope makes the agent guess; a checkbox makes it stop cleanly.
4. **POINTERS** — every inferred ID (org slug from a URL, which MCP is live) is a wasted discovery loop.
