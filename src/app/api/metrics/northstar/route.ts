import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/core/config";
import { getRepo } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { withRoute } from "@/lib/observability";
import { enforceRateLimit } from "@/lib/ratelimit";
import { agentIdForSub } from "@/lib/auth/agent";

function weekStartIso(now = new Date()): string {
  const date = new Date(now);
  const day = date.getUTCDay();
  const diff = (day + 6) % 7;
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString();
}

function isFounder(session: { sub: string; email: string } | null): boolean {
  if (!session) return false;
  if (config.founder.sub && session.sub === config.founder.sub) return true;
  return session.email.toLowerCase() === config.founder.email.toLowerCase();
}

export const GET = withRoute("metrics.northstar", async (req: NextRequest) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  if (!isFounder(session)) return NextResponse.json({ error: "founder access required" }, { status: 403 });

  const agentId = agentIdForSub(session.sub);
  const limited = enforceRateLimit(req, {
    name: "northstar",
    agentId,
    perAgent: 60,
    perIp: 60,
  });
  if (limited) return limited;

  const repo = await getRepo();
  const weekStart = weekStartIso();
  const weekStartMs = Date.parse(weekStart);
  const agents = await repo.listAgents();
  const perAgent: { agentId: string; agentName: string; count: number }[] = [];

  for (const agent of agents) {
    const count = (await repo.listEvents(agent.id)).filter(
      (event) =>
        event.type === "northstar.action.approved" &&
        Date.parse(event.created_at) >= weekStartMs,
    ).length;
    if (count > 0) {
      perAgent.push({
        agentId: agent.id,
        agentName: agent.name,
        count,
      });
    }
  }

  return NextResponse.json({
    weekStart,
    generatedAt: new Date().toISOString(),
    perAgent,
  });
});
