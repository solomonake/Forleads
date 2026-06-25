// POST /api/lead — ensure a lead surface, run the scout swarm, return graded,
// cited evidence cards + the reduce summary (the "fly-to" loading window).
import { NextRequest, NextResponse } from "next/server";
import { ensureCurrentAgent } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { enforceRateLimit } from "@/lib/ratelimit";
import { num, optStr, str, validateBody } from "@/lib/validation";
import { ensureLead, runSwarm } from "@/lib/pipeline";

export const POST = withRoute("lead", async (req: NextRequest) => {
  const body = await validateBody(req, (b) => ({
    address: str(b, "address", { max: 300 }),
    lng: num(b, "lng"),
    lat: num(b, "lat"),
    locality: optStr(b, "locality", { max: 200 }),
  }));
  const agentId = await ensureCurrentAgent();
  if (!agentId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  // Discovery fans out to the external (Overpass) budget — the binding
  // constraint. Tightest limit of any route. (.agent/audits/…capacity-envelope.md)
  const limited = enforceRateLimit(req, { name: "lead", agentId, perAgent: 20, perIp: 30 });
  if (limited) return limited;
  const lead = await ensureLead(agentId, {
    address: body.address,
    lng: body.lng,
    lat: body.lat,
    locality: body.locality,
  });
  const swarm = await runSwarm(lead);
  return NextResponse.json({
    lead: swarm.lead,
    summary: swarm.summary,
    rejectedCount: swarm.rejected.length,
  });
});
