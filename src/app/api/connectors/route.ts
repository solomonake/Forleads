// GET /api/connectors — connector health + accounts for the Connector Hub.
import { NextResponse } from "next/server";
import { readAgentId } from "@/lib/auth/agent";
import { allHealth } from "@/lib/connectors";
import { getRepo } from "@/lib/db";

export async function GET() {
  const agentId = readAgentId();
  const repo = await getRepo();
  const [health, accounts] = await Promise.all([allHealth(), repo.listConnectorAccounts(agentId)]);
  return NextResponse.json({ health, accounts });
}
