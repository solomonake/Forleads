// GET /api/connectors — connector health + accounts for the Connector Hub.
import { NextRequest, NextResponse } from "next/server";
import { DEMO_AGENT_ID } from "@/lib/core/config";
import { allHealth } from "@/lib/connectors";
import { getRepo } from "@/lib/db";

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId") ?? DEMO_AGENT_ID;
  const repo = await getRepo();
  const [health, accounts] = await Promise.all([allHealth(), repo.listConnectorAccounts(agentId)]);
  return NextResponse.json({ health, accounts });
}
