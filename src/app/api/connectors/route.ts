// GET /api/connectors — connector health + accounts for the Connector Hub.
import { NextResponse } from "next/server";
import { readAgentId } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { allHealth } from "@/lib/connectors";
import { getRepo } from "@/lib/db";

export const GET = withRoute("connectors", async () => {
  const agentId = readAgentId();
  const repo = await getRepo();
  const [health, accounts] = await Promise.all([allHealth(), repo.listConnectorAccounts(agentId)]);
  return NextResponse.json({ health, accounts });
});
