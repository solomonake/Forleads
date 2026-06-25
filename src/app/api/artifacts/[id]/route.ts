import { NextRequest, NextResponse } from "next/server";
import { ensureCurrentAgent } from "@/lib/auth/agent";
import type { ArtifactPayload } from "@/lib/core/types";
import { withRoute } from "@/lib/observability";
import { reviseArtifact } from "@/lib/artifacts/revise";
import { num, validateBody } from "@/lib/validation";

function payload(value: unknown): ArtifactPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error("payload must be an object"), { status: 400 });
  }
  return value as ArtifactPayload;
}

const reviseRoute = withRoute<{ params: { id: string } }>(
  "artifacts.revise",
  async (req: NextRequest, { params }) => {
    const agentId = await ensureCurrentAgent();
    if (!agentId) {
      return NextResponse.json({ error: "authentication required" }, { status: 401 });
    }
    const body = await validateBody(req, (b) => ({
      expectedRevision: num(b, "expectedRevision", { min: 1 }),
      payload: payload(b.payload),
    }));
    try {
      const artifact = await reviseArtifact({
        artifactId: params.id,
        agentId,
        expectedRevision: body.expectedRevision,
        payload: body.payload,
      });
      if (!artifact) {
        return NextResponse.json({ error: "artifact not found" }, { status: 404 });
      }
      return NextResponse.json({ artifact });
    } catch (error) {
      const message = error instanceof Error ? error.message : "revision failed";
      if (message.includes("changed")) {
        return NextResponse.json({ error: message }, { status: 409 });
      }
      throw error;
    }
  },
);

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return reviseRoute(req, { params: await context.params });
}
