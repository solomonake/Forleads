// GET /api/report — generate (and return) the Weekly Intelligence Report.
import { NextRequest, NextResponse } from "next/server";
import { DEMO_AGENT_ID } from "@/lib/core/config";
import { generateWeeklyReport } from "@/lib/reports";

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId") ?? DEMO_AGENT_ID;
  const report = await generateWeeklyReport(agentId);
  return NextResponse.json({ report });
}
