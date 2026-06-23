// GET /api/trace/[id] — fetch an Agent Trace by trace id or by artifact id.
import { NextRequest, NextResponse } from "next/server";
import { getRepo } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const repo = await getRepo();
  let trace = await repo.getTrace(params.id);
  if (!trace) trace = await repo.getTraceForArtifact(params.id);
  if (!trace) return NextResponse.json({ error: "trace not found" }, { status: 404 });
  return NextResponse.json({ trace });
}
