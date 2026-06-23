// POST /api/approve — the human gate. Idempotently writes the approved artifact
// to its connector (Gmail draft / calendar / CRM). Fail-closed: a compliance-
// blocked artifact cannot be approved.
import { NextRequest, NextResponse } from "next/server";
import { approveArtifact } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { artifactId: string };
    if (!body.artifactId) {
      return NextResponse.json({ error: "artifactId required" }, { status: 400 });
    }
    const result = await approveArtifact(body.artifactId);
    if (!result) return NextResponse.json({ error: "artifact not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    // Compliance block is a 422, not a 500.
    const status = msg.includes("compliance") ? 422 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
