// GET /api/trace/[id] — fetch an Agent Trace by trace id or by artifact id.
import { NextRequest, NextResponse } from "next/server";
import { withRoute } from "@/lib/observability";
import { getRepo } from "@/lib/db";

const traceRoute = withRoute<{ params: { id: string } }>(
  "trace.get",
  async (_req: NextRequest, { params }) => {
    const repo = await getRepo();
    let trace = await repo.getTrace(params.id);
    if (!trace) trace = await repo.getTraceForArtifact(params.id);
    if (!trace) return NextResponse.json({ error: "trace not found" }, { status: 404 });
    return NextResponse.json({ trace });
  },
);

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return traceRoute(req, { params: await context.params });
}
