// POST /api/notes — record a note, classify the situation, return suggested
// next-best-actions. Emits note.created so matching loops can fire.
import { NextRequest, NextResponse } from "next/server";
import { requireAgentId } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { enforceRateLimit } from "@/lib/ratelimit";
import { optStr, str, validateBody } from "@/lib/validation";
import { nowISO, uuid } from "@/lib/core/ids";
import { classifyNoteBest } from "@/lib/agents/notes";
import { getRepo } from "@/lib/db";
import { emit } from "@/lib/pipeline";

export const POST = withRoute("notes", async (req: NextRequest) => {
  const body = await validateBody(req, (b) => ({
    leadId: str(b, "leadId", { max: 100 }),
    body: str(b, "body", { max: 8000 }),
    modality: optStr(b, "modality", { allowed: ["text", "voice"] as const }),
  }));
  const agentId = requireAgentId();
  if (!agentId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const limited = enforceRateLimit(req, { name: "compose", agentId, perAgent: 30, perIp: 45 });
  if (limited) return limited;
  const repo = await getRepo();
  const classification = await classifyNoteBest(body.body);

  const note = await repo.addNote({
    id: uuid(),
    lead_surface_id: body.leadId,
    agent_id: agentId,
    body: body.body,
    modality: body.modality ?? "text",
    situation: classification.situation,
    created_at: nowISO(),
  });

  await emit(
    agentId,
    "note.created",
    { noteId: note.id, situation: classification.situation, confidence: classification.confidence },
    "notes",
    body.leadId
  );

  return NextResponse.json({ note, classification });
});
