// POST /api/draft — compose a draft artifact for a situation/action, run the
// fail-closed compliance linter, persist it + its Agent Trace. Draft-first.
import { NextRequest, NextResponse } from "next/server";
import { requireAgentId } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { enforceRateLimit } from "@/lib/ratelimit";
import { oneOf, optNum, str, validateBody } from "@/lib/validation";
import { ACTION_TYPES, SITUATIONS, type ActionType, type Situation } from "@/lib/core/types";
import { getRepo } from "@/lib/db";
import { DEMO_AGENT } from "@/lib/db/seed";
import { draftArtifact } from "@/lib/pipeline";

export const POST = withRoute("draft", async (req: NextRequest) => {
  const body = await validateBody(req, (b) => ({
    leadId: str(b, "leadId", { max: 100 }),
    situation: oneOf<Situation>(b, "situation", SITUATIONS),
    actionType: oneOf<ActionType>(b, "actionType", ACTION_TYPES),
    situationConfidence: optNum(b, "situationConfidence", { min: 0, max: 1 }),
  }));
  const agentId = requireAgentId();
  if (!agentId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const limited = enforceRateLimit(req, { name: "compose", agentId, perAgent: 30, perIp: 45 });
  if (limited) return limited;
  const repo = await getRepo();
  const lead = await repo.getLead(body.leadId);
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });
  const agent = (await repo.getAgent(agentId)) ?? DEMO_AGENT;
  const evidence = await repo.listEvidence(body.leadId);

  const artifact = await draftArtifact({
    agent,
    lead,
    situation: body.situation,
    situationConfidence: body.situationConfidence ?? 0.85,
    actionType: body.actionType,
    evidence,
    trigger: "note.created",
  });

  return NextResponse.json({ artifact });
});
