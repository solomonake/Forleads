// GET /api/inbox — all prepared work (drafts/tasks/holds/blocked/sent) for the
// Action Inbox. Joins each artifact with its lead address for display.
import { NextRequest, NextResponse } from "next/server";
import { DEMO_AGENT_ID } from "@/lib/core/config";
import { getRepo } from "@/lib/db";

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId") ?? DEMO_AGENT_ID;
  const repo = await getRepo();
  const artifacts = await repo.listArtifacts(agentId);
  const items = await Promise.all(
    artifacts.map(async (a) => {
      const lead = a.lead_surface_id ? await repo.getLead(a.lead_surface_id) : null;
      return { artifact: a, leadAddress: lead?.address ?? "—" };
    })
  );
  return NextResponse.json({ items });
}
