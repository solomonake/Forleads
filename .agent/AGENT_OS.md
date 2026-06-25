# Agent OS — how agents work in this repo

This folder is a **knowledge graph for agents**. Any model (Opus, Sonnet, Codex,
Copilot) reads it on entry and writes back to it on exit, so each session starts
smarter than the last and never re-learns what's already known. Humans read it
too — it's the shared brain.

## The files (nodes of the graph)

| File | Holds | Read when |
|---|---|---|
| `AGENT_OS.md` (this) | How we operate: loops, token budget, planning, human-in-loop | First, every session |
| `onboarding-notes.md` | Repo facts: stack, commands, git, host, secrets needed | First, every session |
| `playbook.md` | Reusable patterns + a **gotchas table** (failures already solved) | Before acting; before debugging anything |
| `decisions.md` | Why the architecture is the way it is (ADRs) | When a choice seems odd or you want to change it |
| `plans/*.md` | Model-agnostic, ready-to-execute plans for upcoming work | When picking up the next chunk |
| `session-state.json` | Human-owned objective, acceptance criteria, baseline, next actions | When the phase changes |
| `scorecard.config.json` | Model-neutral commands, points, timeouts, required gates | Before changing verification |
| `CHECKPOINT.json` | Atomic machine snapshot of repo + run state | First after a crash or model switch |
| `SCORECARD.json` | Last run, including interrupted/running/failed checks | Before claiming completion |
| `SESSION_HANDOFF.md` | Generated readable view of the checkpoint | When continuing in a fresh window |

Cross-link between files with `→ playbook.md#osm` style references. The graph is
the links.

## The operating loop (every task)

```
ORIENT → PLAN → ACT → VERIFY → RECORD
```

1. **ORIENT** (cheap, read-only): read this folder + the relevant code. Never
   re-derive what onboarding-notes / playbook already states.
2. **PLAN**: for anything non-trivial, write/refresh a plan in `plans/`. A good
   plan is model-agnostic (see below) so any model can execute it.
3. **ACT**: make the change. Prefer the smallest diff that matches surrounding
   code. Batch independent tool calls in one step.
4. **VERIFY**: run the repo's gates (typecheck, lint, test) and — for anything a
   user can see — actually run it and look. Don't claim done on faith.
5. **RECORD**: if you hit and solved a failure, add a row to the gotchas table.
   If you made a non-obvious choice, log it in decisions.md. Update
   onboarding-notes if a fact changed. This is the self-improvement step — skip
   it and the next session repeats your pain.

For any session that changes code, finish with `npm run agent:scorecard`. Do not
hand-edit `CHECKPOINT.json`, `SCORECARD.json`, or `SESSION_HANDOFF.md`; they are
atomically generated from `session-state.json`, the scorecard config, live
production policy, command results, and Git state. After a crash, read
`CHECKPOINT.json` and run its `resumeCommand`.

## Token budget discipline (cost = quality here)

Opus works best under ~200k context tokens; quality degrades as it fills. Treat
context as a budget, not infinite:

- **Read narrow.** Read the part of a file you need (offset/limit, grep first),
  not the whole thing. Grep to locate, then read the hit.
- **Don't re-read.** If a file's content is already in this session, use it.
- **Batch parallel tool calls** in one turn when they're independent — one
  round-trip, less overhead.
- **Verify cheaply.** A targeted `curl`/SQL probe of the risky layer beats
  spinning the whole app. (We proved the Supabase geo round-trip and live OSM
  with one call each.)
- **Prefer dedicated tools** (Edit/Read/Grep) over shelling out `cat`/`sed`.
- **Hand off before you're full.** At ~70% context, stop and write
  `SESSION_HANDOFF.md` so a fresh window resumes with a small, dense seed
  instead of dragging a bloated transcript. A 2-page handoff is worth 150k
  tokens of scrollback.

## Model-agnostic planning (so any model reproduces top work)

A plan should carry everything a model needs so the *model* stops mattering.
Template in `plans/TEMPLATE.md`. Every plan states: **Goal · Context links ·
Exact files & seams · Steps · Verification · Risks/gotchas · Done criteria.**
If a plan needs the agent to "be smart," it's underspecified — push the
intelligence into the plan, not the model.

## Human-in-the-loop protocol

Agents discover everything they can; they **ask the human only for what they
genuinely can't reach**, and they ask with exact steps. Ask (don't guess) for:
secrets/keys, outward-facing approvals (deploy, send, merge to main),
destructive actions, or a genuine product decision. When you ask, give the human
a numbered "how to get this" so a first-timer can do it. Record the answer so
you never ask twice.

## Self-improvement contract

Before debugging, check `playbook.md#gotchas` — the failure may already be
solved. After solving a *new* failure (a stress test, an env quirk, a flaky
provider), add a row so it's solved forever. The gotchas table is how the system
gets less mediocre over time.
