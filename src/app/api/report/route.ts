// GET /api/report — generate (and return) the Weekly Intelligence Report.
import { NextResponse } from "next/server";
import { readAgentIdEnsured } from "@/lib/auth/agent";
import { getSession } from "@/lib/auth/session";
import { config } from "@/lib/core/config";
import { tenantConnectorStatuses } from "@/lib/connectors/tenant-status";
import { withRoute } from "@/lib/observability";
import { generateWeeklyReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

export const GET = withRoute("report", async () => {
  const agentId = await readAgentIdEnsured();
  const session = await getSession();
  // Same statuses the Connect page shows, so Recap never recommends a
  // connector that page would label Blocked.
  // Google sign-in that isn't configured on this deployment can't be acted on either.
  const googleReady = Boolean(config.google.clientId && config.google.clientSecret);
  const connectors = (await tenantConnectorStatuses(agentId, Boolean(session?.googleCredentialRef))).map((c) =>
    c.provider === "google" && !googleReady ? { ...c, availability: "blocked" as const } : c,
  );
  const report = await generateWeeklyReport(agentId, connectors);
  return NextResponse.json({ report });
});
