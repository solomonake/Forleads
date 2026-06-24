// GET /api/report — generate (and return) the Weekly Intelligence Report.
import { NextResponse } from "next/server";
import { readAgentId } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { generateWeeklyReport } from "@/lib/reports";

export const GET = withRoute("report", async () => {
  const agentId = readAgentId();
  const report = await generateWeeklyReport(agentId);
  return NextResponse.json({ report });
});
