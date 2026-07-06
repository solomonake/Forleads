// POST /api/reject — the "no" half of the human gate. Updates the artifact to
// cancelled and writes an outcome memory so the composer can learn that this
// kind of message wasn't right for this lead. Idempotent.
import { NextRequest, NextResponse } from "next/server";
import { ensureCurrentAgent } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { optStr, str, validateBody } from "@/lib/validation";
import { rejectArtifact } from "@/lib/pipeline";

export const POST = withRoute("reject", async (req: NextRequest) => {
  const body = await validateBody(req, (b) => ({
    artifactId: str(b, "artifactId", { max: 100 }),
    reason: optStr(b, "reason", { max: 2000 }),
  }));

  // Reject is a state-changing per-agent action — same demo-aware auth policy
  // as approve. (The old `if (!getSession())` never fired: getSession is
  // async, so the un-awaited promise was always truthy.)
  const agentId = await ensureCurrentAgent();
  if (!agentId) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }

  const result = await rejectArtifact(body.artifactId, body.reason, { agentId });
  if (!result) return NextResponse.json({ error: "artifact not found" }, { status: 404 });

  return NextResponse.json({
    artifact: result.artifact,
    memoryId: result.memoryId ?? null,
  });
});
