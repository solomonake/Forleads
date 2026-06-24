// GET /api/leads — list lead surfaces (Pipeline board + map pins).
import { NextResponse } from "next/server";
import { readAgentId } from "@/lib/auth/agent";
import { getRepo } from "@/lib/db";

export async function GET() {
  const agentId = readAgentId();
  const repo = await getRepo();
  const leads = await repo.listLeads(agentId);
  return NextResponse.json({ leads });
}
