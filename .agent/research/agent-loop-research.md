# Agent loop research notes

Checked: 2026-06-30.

This is a repo-safe summary for Forleads' agent operating loop. It records
research direction, not private SRL internals.

## Takeaways

- **Plan-act-observe beats static prompting.** ReAct-style loops are useful
  because reasoning traces are paired with environment observations. Forleads
  should keep every phase tied to observed repo state, gates, and artifacts.
- **Reflection must be grounded in tests and evidence.** Reflexion and
  Self-Refine show that feedback can improve later attempts, but Forleads must
  promote only verified lessons: failing tests fixed, gates passed, drift
  corrected, and handoff recovery shortened.
- **Skill growth needs a verifier.** Voyager-style skill libraries suggest
  reusable routines compound, but Forleads should accept new skills only after
  they reduce future context, improve gate pass rates, or prevent repeated
  mistakes.
- **Self-regulation should change planning depth.** Self-regulated planning
  research points toward spending more planning tokens on uncertain/risky phases
  and less on mechanical slices. Forleads should make phase runners choose
  "thin prompt" vs "deep review" based on risk, drift, and prior failures.
- **Risk management needs measured records.** NIST AI RMF guidance maps well to
  Forleads' scorecards: govern the loop, map task risk, measure evidence/cost/
  defects, and manage drift before continuing.

## Sources

- ReAct: `https://arxiv.org/abs/2210.03629`
- Reflexion: `https://arxiv.org/abs/2303.11366`
- Self-Refine: `https://arxiv.org/abs/2303.17651`
- Voyager: `https://arxiv.org/abs/2305.16291`
- NIST AI RMF: `https://www.nist.gov/itl/ai-risk-management-framework`
- NIST Generative AI Profile: `https://www.nist.gov/itl/ai-risk-management-framework/nist-ai-600-1`

## Forleads loop rules

1. A phase packet is not the prompt. It is the source of truth.
2. A worker receives only the phase packet, shared operating docs, and exact
   source files named by the packet.
3. A phase is not complete until it records product, safety, evidence, token,
   and drift metrics.
4. A novelty is useful only when it is safe, reversible, measured, and captured
   as a future reusable move.
5. If drift is detected, stop fan-out, write a handoff, and resume from the
   cheapest risky proof.
