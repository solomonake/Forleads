import { NextRequest, NextResponse } from "next/server";
import { requireAgentId } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { enforceRateLimit } from "@/lib/ratelimit";
import { syncFollowUpBossOverlay } from "@/lib/connectors/followupboss-overlay";

const handler = withRoute("connectors.followupboss.sync", async (req: NextRequest) => {
  const agentId = await requireAgentId();
  if (!agentId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const limited = enforceRateLimit(req, {
    name: "connectors.followupboss.sync",
    agentId,
    perAgent: 6,
    perIp: 10,
  });
  if (limited) return limited;
  let body: { cursor?: unknown } = {};
  try {
    body = await req.json() as { cursor?: unknown };
  } catch {
    body = {};
  }
  if (body.cursor !== undefined) {
    return NextResponse.json({ error: "partial cursor sync is not supported; run one complete safe snapshot" }, { status: 400 });
  }
  const result = await syncFollowUpBossOverlay(agentId);
  return NextResponse.json(result);
});

export async function POST(req: NextRequest) {
  return handler(req);
}
