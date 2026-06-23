// GET /api/leads — list lead surfaces (Pipeline board + map pins).
import { NextRequest, NextResponse } from "next/server";
import { DEMO_AGENT_ID } from "@/lib/core/config";
import { getRepo } from "@/lib/db";

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId") ?? DEMO_AGENT_ID;
  const repo = await getRepo();
  const leads = await repo.listLeads(agentId);
  return NextResponse.json({ leads });
}
