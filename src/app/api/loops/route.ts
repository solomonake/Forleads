// GET  /api/loops  — list loop definitions + recent runs (Loop Studio)
// POST /api/loops  — run a loop now against a lead (manual trigger / demo)
import { NextRequest, NextResponse } from "next/server";
import { readAgentId, requireAgentId } from "@/lib/auth/agent";
import type { Situation } from "@/lib/core/types";
import { getRepo } from "@/lib/db";
import { runLoop } from "@/lib/loops/engine";

export async function GET() {
  const agentId = readAgentId();
  const repo = await getRepo();
  const [definitions, runs] = await Promise.all([
    repo.listLoopDefs(agentId),
    repo.listLoopRuns(agentId),
  ]);
  return NextResponse.json({ definitions, runs });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      loopId: string;
      leadId: string;
      situation?: Situation;
    };
    const agentId = requireAgentId();
    if (!agentId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
    const repo = await getRepo();
    const def = await repo.getLoopDef(body.loopId);
    const lead = await repo.getLead(body.leadId);
    if (!def || !lead) return NextResponse.json({ error: "loop or lead not found" }, { status: 404 });
    const evidence = await repo.listEvidence(body.leadId);
    const run = await runLoop(def, {
      lead,
      situation: body.situation ?? "no_contact",
      situationConfidence: 0.9,
      evidence,
      triggerSource: "manual",
    });
    return NextResponse.json({ run });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
