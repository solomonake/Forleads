// ============================================================================
// Agent Trace generator — "Why this happened" (docs/_ProductionMarketPlan_ §8
// S14). Every agent action must be inspectable: trigger, situation, evidence
// used, what was EXCLUDED and why, policy result, connector, and cost.
// ============================================================================

import { nowISO, uuid } from "@/lib/core/ids";
import type {
  AgentTrace,
  Artifact,
  ComplianceResult,
  EvidenceCard,
  PriorOutcomeSummary,
} from "@/lib/core/types";

export interface BuildTraceInput {
  agentId: string;
  artifact?: Artifact;
  loopRunId?: string;
  trigger: string;
  situation?: string;
  situationConfidence?: number;
  evidenceUsed: EvidenceCard[];
  excluded: { content: string; reason: string }[];
  compliance: ComplianceResult;
  connector?: {
    provider: string;
    action: string;
    idempotencyKey: string;
    sent: boolean;
  };
  cost: { claudeCalls: number; paidDataCalls: number; ms: number };
  priorOutcomes?: PriorOutcomeSummary;
}

export function buildTrace(input: BuildTraceInput): AgentTrace {
  const policy: AgentTrace["policy"] = [
    {
      name: "fair_housing",
      result: input.compliance.pass ? "pass" : "fail",
    },
  ];
  // Surface each blocking compliance category as its own policy line.
  for (const flag of input.compliance.flags) {
    policy.push({
      name: `fair_housing:${flag.category}`,
      result: flag.severity === "block" ? "fail" : "pass",
    });
  }

  return {
    id: uuid(),
    agent_id: input.agentId,
    artifact_id: input.artifact?.id,
    loop_run_id: input.loopRunId,
    trigger: input.trigger,
    situation: input.situation,
    situationConfidence: input.situationConfidence,
    evidenceUsed: input.evidenceUsed.map((c) => ({
      claim: c.claim,
      confidence: c.confidence,
    })),
    excluded: input.excluded,
    policy,
    priorOutcomes: input.priorOutcomes,
    connector: input.connector,
    cost: input.cost,
    created_at: nowISO(),
  };
}
