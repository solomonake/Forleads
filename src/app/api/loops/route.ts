// GET  /api/loops  — list loop definitions + recent runs (Loop Studio)
// POST /api/loops  — run a loop now against a lead (manual trigger / demo)
import { NextRequest, NextResponse } from "next/server";
import { ensureCurrentAgent, readAgentIdEnsured } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { optStr, str, validateBody } from "@/lib/validation";
import { SITUATIONS, type Situation } from "@/lib/core/types";
import { getRepo } from "@/lib/db";
import { runLoop } from "@/lib/loops/engine";

export const GET = withRoute("loops.list", async () => {
  const agentId = await readAgentIdEnsured();
  const repo = await getRepo();
  const [definitions, runs] = await Promise.all([
    repo.listLoopDefs(agentId),
    repo.listLoopRuns(agentId),
  ]);
  return NextResponse.json({ definitions, runs });
});

export const POST = withRoute("loops.run", async (req: NextRequest) => {
  const body = await validateBody(req, (b) => ({
    loopId: str(b, "loopId", { max: 100 }),
    leadId: str(b, "leadId", { max: 100 }),
    situation: optStr<Situation>(b, "situation", { allowed: SITUATIONS }),
  }));
  const agentId = await ensureCurrentAgent();
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
});
