// POST /api/draft — compose a draft artifact for a situation/action, run the
// fail-closed compliance linter, persist it + its Agent Trace. Draft-first.
import { NextRequest, NextResponse } from "next/server";
import { DEMO_AGENT_ID } from "@/lib/core/config";
import type { ActionType, Situation } from "@/lib/core/types";
import { getRepo } from "@/lib/db";
import { DEMO_AGENT } from "@/lib/db/seed";
import { draftArtifact } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      leadId: string;
      situation: Situation;
      actionType: ActionType;
      situationConfidence?: number;
      agentId?: string;
    };
    if (!body.leadId || !body.situation || !body.actionType) {
      return NextResponse.json({ error: "leadId, situation, actionType required" }, { status: 400 });
    }
    const agentId = body.agentId ?? DEMO_AGENT_ID;
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
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
