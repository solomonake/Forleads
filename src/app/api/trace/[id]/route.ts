// GET /api/trace/[id] — fetch an Agent Trace by trace id or by artifact id.
// SECURITY: traces carry a tenant's notes, drafts and reasoning, and the
// Supabase repo reads with the service role (no RLS), so the route itself
// scopes to the caller's workspace: the signed-in agent, or the public demo
// workspace when signed out (same as /api/inbox and /api/leads). Another
// tenant's trace is a 404, never a 403, so ids can't be probed.
import { NextRequest, NextResponse } from "next/server";
import { readAgentIdEnsured } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { getRepo } from "@/lib/db";

const traceRoute = withRoute<{ params: { id: string } }>(
  "trace.get",
  async (_req: NextRequest, { params }) => {
    const agentId = await readAgentIdEnsured();
    const repo = await getRepo();
    let trace = await repo.getTrace(params.id);
    if (!trace) trace = await repo.getTraceForArtifact(params.id);
    if (!trace || trace.agent_id !== agentId) {
      return NextResponse.json({ error: "trace not found" }, { status: 404 });
    }
    return NextResponse.json({ trace });
  },
);

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return traceRoute(req, { params: await context.params });
}
