// GET /api/inbox — all prepared work (drafts/tasks/holds/blocked/sent) for the
// Action Inbox. Joins each artifact with its lead address for display.
import { NextResponse } from "next/server";
import { readAgentIdEnsured } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { getRepo } from "@/lib/db";

export const GET = withRoute("inbox", async () => {
  const agentId = await readAgentIdEnsured();
  const repo = await getRepo();
  const artifacts = await repo.listArtifacts(agentId);
  const items = await Promise.all(
    artifacts.map(async (a) => {
      const lead = a.lead_surface_id ? await repo.getLead(a.lead_surface_id) : null;
      return { artifact: a, leadAddress: lead?.address ?? "—" };
    })
  );
  return NextResponse.json({ items });
});
