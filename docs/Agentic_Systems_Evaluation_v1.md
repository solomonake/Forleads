# Agentic Systems Evaluation v1

## Thesis

The moat is not “using a stronger model.” It is a model-neutral operating system
that converts failures into tested constraints, keeps evidence outside chat
history, and makes a cheaper replacement agent productive quickly.

## Unit of evaluation

Evaluate one bounded task, incident, or continuation attempt. Record the risk
tier, acceptance criteria, agent/model, elapsed time, human interventions,
mandatory gates, escaped defects, security findings, estimated cost, and
handoff recovery time.

Do not compare unlike work. Segment results by task class and risk tier:
feature, incident, migration, provider integration, UX, security, and research.

## Core metrics and thresholds

| Metric | Definition | Initial threshold |
|---|---|---|
| Verified task success | Done criteria met with required proof | ≥95% rolling 20 tasks |
| Mandatory gate integrity | Required gates passed before merge | 100% |
| P0/P1 escaped regressions | Critical/high defect reaches main or production | 0 |
| Tenant/security boundary failures | Cross-tenant, secret, auth, or destructive-policy breach | 0 |
| Fabricated external success | Product says a provider write happened when it did not | 0 |
| Handoff recovery | New agent reaches a correct next action from cold start | median ≤10 min, p90 ≤20 min |
| Human intervention | Non-secret/non-spend decisions needed from the user | median ≤2 per high-risk task |
| Three-day reliability | Properly scoped tasks completed and verified within 72 hours | ≥90% |
| Learning closure | Novel failure becomes a test plus playbook/decision entry | 100% for P0/P1; ≥80% overall |
| Evidence completeness | PR has intent, proof, risk, rollback, and production result | 100% high/critical |

Cost is measured, not minimized blindly. Track estimated dollars, elapsed time,
commands, repeated reads, and retries per verified task. Optimize cost only
after safety and correctness stay above threshold.

## Claude/Codex performance protocol

1. Give each agent the same plan, checkpoint, authority boundary, and done
   criteria.
2. Use tasks from the versioned evaluation corpus or matched real tasks.
3. Score observable behavior only: useful actions, regressions, interventions,
   proof, cost, and recovery.
4. Use at least ten matched tasks before drawing a directional conclusion and
   twenty before promoting a standing model-routing rule.
5. Record failures as data, not embarrassment. A failed run that creates a
   durable test can improve the system.
6. Never publish customer data, secrets, private prompts, or chain of thought.
   Publish task packets, patches, commands, outcomes, and aggregate metrics.

## Continuity protocol

Chat history is a cache. The repository is the source of truth.

- Refresh `.agent/handoffs/current.md` after ORIENT, PLAN, IMPLEMENT, VERIFY,
  and SHIP, and before a long build/deploy/research pass.
- The checkpoint names one exact next action and includes known-broken
  governance, not only green code.
- A replacement agent must run the cheapest risky-seam proof before editing.
- If checkpoint facts conflict with Git, CI, or production, current observable
  state wins and the checkpoint is corrected.

## Research-paper path

For a publishable study, freeze the evaluation corpus, schema, tool versions,
and thresholds; preregister hypotheses; run matched tasks across models; report
success, intervention, defects, recovery, latency, and cost with confidence
intervals; publish anonymized task packets and verification artifacts. The
claim should be about the operating system's effect, not model sentience or
hidden reasoning.
