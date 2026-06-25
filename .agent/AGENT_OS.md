# Agent OS v2

This directory is the durable knowledge and proof layer shared by Codex and
Claude. `AGENTS.md` is the root contract. Chat history is disposable.

## Knowledge graph

| Node | Purpose |
|---|---|
| `onboarding-notes.md` | Current stack, commands, hosting, and environment facts |
| `playbook.md` | Reusable patterns and solved failures |
| `decisions.md` | Accepted architecture decisions and tradeoffs |
| `plans/` | Decision-complete task packets |
| `knowledge/catalog.json` | Source provenance, freshness, trust, and actionable rules |
| `evals/corpus.v1.json` | Versioned product, adversarial, and regression scenarios |
| `handoffs/` | Historical continuation state |
| `handoffs/current.md` | Crash-resistant latest checkpoint for the next agent |
| `metrics/` | Versioned task scorecards for model and workflow evaluation |

## Operating loop

1. Orient: read the small operating files and inspect the relevant code.
2. Pain: state the user, job, observed pain, and business value.
3. Research: verify unstable facts using primary or approved sources.
4. Plan: define current and desired behavior, non-goals, seams, and acceptance.
5. Risk: choose low, medium, high, or critical using `AGENTS.md`.
6. Implement: make the smallest coherent change.
7. Test: run targeted tests, then the risk-selected gate.
8. Break: attack malformed input, stale state, retries, timeouts, and partial failure.
9. Review: invoke only relevant specialists, capped at three.
10. Product verify: exercise happy, empty, failure, recovery, and responsive paths.
11. Record: update a gotcha, ADR, knowledge entry, or handoff when warranted.
12. Draft PR: include intent, proof, cost proxies, demo, risk, and rollback.

## Token and context discipline

- Search first, then read narrow slices.
- Do not reread material already summarized in the task context.
- Batch independent inspections.
- Prefer a targeted probe of the risky seam before a full suite.
- Keep static doctrine out of prompts; retrieve only relevant knowledge entries.
- Track exact runtime tokens when exposed. Otherwise report context bytes/files,
  repeated reads, command count, elapsed time, and verification cost as proxies.
- Stop uncontrolled exploration and write a handoff when context becomes noisy.
- Checkpoint after ORIENT, PLAN, IMPLEMENT, VERIFY, and SHIP. Do not wait until
  the last tokens: `npm run agent:checkpoint -- --goal="..." --completed="..." --next="..."`.
- A new model trusts the checkpoint enough to start, then verifies its cheapest
  risky claim against Git, CI, or production before editing.

## Human boundary

Agents may create a branch, implement, verify, commit, push, and open a draft PR
only after mandatory gates pass. Merge, deployment, spending, production
mutation, destructive action, and external communication require approval.

When the user explicitly grants standing merge/deploy authority for a task,
shipping is part of the terminal loop: green gates -> merge -> production
verification -> next phase. Do not stop at a local pass, pushed branch, or PR.

Within an authorized task, agents should execute ordinary reversible commands
without asking the user to supervise each step. Human attention is reserved for
secrets, spending, destructive actions, material scope changes, production
mutation, and outward communication.

## Learning promotion

Product-specific facts stay local. Promote a lesson into the future shared OS
only when it is generalizable, evidence-backed, tested, non-secret, and not
coupled to Forleads' accidental architecture.

## Performance measurement

Record substantial runs with `npm run agent:scorecard`. Compare models only on
matched task classes and risk tiers. The zero-tolerance constraints are tenant
or security breaches, fabricated external success, and required gates skipped
before merge. See `docs/Agentic_Systems_Evaluation_v1.md`.
