// GET /api/report — generate (and return) the Weekly Intelligence Report.
import { NextResponse } from "next/server";
import { readAgentId } from "@/lib/auth/agent";
import { generateWeeklyReport } from "@/lib/reports";

export async function GET() {
  const agentId = readAgentId();
  const report = await generateWeeklyReport(agentId);
  return NextResponse.json({ report });
}
