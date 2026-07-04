// GET /api/connectors — per-tenant connector status + intelligence sources
// for the Connector Hub. `providers` is the new per-agent shape that drives
// the "Not connected / Connected as X" cards; `health` + `accounts` are kept
// for backwards compatibility with older Hub renderers.
import { NextResponse } from "next/server";
import { readAgentIdEnsured } from "@/lib/auth/agent";
import { getSession } from "@/lib/auth/session";
import { withRoute } from "@/lib/observability";
import { allHealth } from "@/lib/connectors";
import { tenantConnectorStatuses } from "@/lib/connectors/tenant-status";
import { getRepo } from "@/lib/db";
import { dataSourceReadiness } from "@/lib/providers/readiness";

export const dynamic = "force-dynamic";

export const GET = withRoute("connectors", async () => {
  const agentId = await readAgentIdEnsured();
  const session = await getSession();
  const googleConnected = Boolean(session?.googleCredentialRef);
  const repo = await getRepo();
  const [health, accounts, providers] = await Promise.all([
    allHealth(),
    repo.listConnectorAccounts(agentId),
    tenantConnectorStatuses(agentId, googleConnected),
  ]);
  return NextResponse.json({
    providers,
    health,
    accounts,
    dataSources: dataSourceReadiness(),
  });
});
