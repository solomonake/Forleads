# Forleads Agent Operating Contract

This is the model-neutral entrypoint for Codex and Claude. Product truth lives
in `docs/`; operating truth lives in `.agent/`.

## Entry sequence

1. Read `.agent/AGENT_OS.md`, `.agent/onboarding-notes.md`,
   `.agent/playbook.md`, and `.agent/decisions.md`.
2. Run `npm run agent:doctor`.
3. Search before reading large files. Generate a task context pack with
   `npm run agent:context -- --intent="<task>" --risk=<tier> --paths=<paths>`.
4. For substantial work, fill `.agent/plans/TEMPLATE.md` before editing.
5. Read `.agent/handoffs/current.md` before repeating discovery. Refresh it with
   `npm run agent:checkpoint` after each meaningful lifecycle phase and before
   long operations where context or token exhaustion could interrupt the task.

## Lifecycle

`ORIENT -> PAIN -> RESEARCH -> PLAN -> RISK -> IMPLEMENT -> TEST -> BREAK -> REVIEW -> PRODUCT VERIFY -> RECORD -> DRAFT PR`

- Start from the user and business problem, not only the requested code shape.
- Prefer deterministic code for facts, validation, policy, merging, and retries.
- Models reason over grounded evidence; they are never the source of facts.
- Every outward side effect is human-gated and idempotent.
- If a mandatory gate cannot pass, stop, preserve evidence, and write a handoff.
- At task completion, append a model-neutral run record with
  `npm run agent:scorecard`; judge agents by verified outcomes, intervention,
  defects, recovery time, and cost rather than persuasive prose.

## Risk tiers

- `low`: docs, copy, isolated styles.
- `medium`: normal product behavior.
- `high`: auth, privacy, persistence, migrations, connectors, agent policy,
  external providers, or expensive operations.
- `critical`: payments, destructive migrations, production writes, auto-send,
  credentials, or tenant-boundary changes.

Run `npm run agent:check -- --risk=<tier>`. High and critical work requires
coverage, build, adversarial tests, rollback notes, and relevant specialist
review. Critical work also requires end-to-end proof. Merge, deploy, spend,
production mutation, and external communication remain human-approved.

Use one primary agent and at most three relevant specialist passes chosen from:
product strategist, architect, test breaker, security reviewer,
performance/cost reviewer, and final staff reviewer.

Forleads invariants remain binding: map-first, no naked numbers, fail-closed
compliance, human approval, bounded agents, graceful degradation, tenant
isolation, inspectable traces, and idempotent connector writes.
