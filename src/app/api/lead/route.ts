// POST /api/lead — ensure a lead surface, run the scout swarm, return graded,
// cited evidence cards + the reduce summary (the "fly-to" loading window).
import { NextRequest, NextResponse } from "next/server";
import { requireAgentId } from "@/lib/auth/agent";
import { enforceRateLimit } from "@/lib/ratelimit";
import { ensureLead, runSwarm } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      address: string;
      lng: number;
      lat: number;
      locality?: string;
    };
    if (!body.address || typeof body.lng !== "number" || typeof body.lat !== "number") {
      return NextResponse.json({ error: "address, lng, lat required" }, { status: 400 });
    }
    const agentId = requireAgentId();
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
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
