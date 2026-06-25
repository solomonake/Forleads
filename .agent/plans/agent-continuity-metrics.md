# Agent continuity and measurable learning

**Goal:** A new Codex or Claude session can resume verified work in under ten
minutes, and every substantial task leaves comparable evidence about quality,
cost, intervention, and recovery.

**Why / value:** Chat context and model budgets expire. Product truth must
survive outside the model, while model performance must be judged by outcomes
rather than confidence or prose quality.

**Risk:** low — operating docs and local developer tooling.

## Desired behavior

- `npm run agent:checkpoint` writes a compact, current continuation packet.
- Agents refresh that checkpoint after each lifecycle phase and before long or
  context-heavy operations.
- `npm run agent:scorecard` appends a versioned JSONL measurement row.
- Claude, Codex, and future agents use the same metrics and thresholds.
- Security, tenant isolation, external-write honesty, and mandatory gates remain
  zero-tolerance constraints.

## Acceptance

- Checkpoint output includes branch, commit, dirty files, goal, completed work,
  next action, blockers, authority, and proof.
- Scorecard rejects invalid outcomes and emits schema-versioned JSON.
- Doctor recognizes the new scripts and continuity files.
- Documentation defines metrics, thresholds, and an experiment protocol.

