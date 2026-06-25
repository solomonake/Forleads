// GET /api/leads — list lead surfaces (Pipeline board + map pins).
import { NextResponse } from "next/server";
import { readAgentIdEnsured } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { getRepo } from "@/lib/db";

export const GET = withRoute("leads", async () => {
  const agentId = await readAgentIdEnsured();
  const repo = await getRepo();
  const leads = await repo.listLeads(agentId);
  return NextResponse.json({ leads });
});
