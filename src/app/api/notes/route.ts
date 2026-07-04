// POST /api/notes — record a note, classify the situation, return suggested
// next-best-actions. Emits note.created so matching loops can fire.
import { NextRequest, NextResponse } from "next/server";
import { ensureCurrentAgent } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { enforceRateLimit } from "@/lib/ratelimit";
import { optStr, str, validateBody } from "@/lib/validation";
import { nowISO, uuid } from "@/lib/core/ids";
import { classifyNoteBest } from "@/lib/agents/notes";
import { persistEvidenceMemory, persistNoteMemory } from "@/lib/agents/memory";
import { getRepo } from "@/lib/db";
import { emit } from "@/lib/pipeline";
import { extractFieldSignal, fieldSignalEvidence } from "@/lib/field-scout";

export const POST = withRoute("notes", async (req: NextRequest) => {
  const body = await validateBody(req, (b) => ({
    leadId: str(b, "leadId", { max: 100 }),
    body: str(b, "body", { max: 8000 }),
    modality: optStr(b, "modality", { allowed: ["text", "voice"] as const }),
  }));
  const agentId = await ensureCurrentAgent();
  if (!agentId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const limited = enforceRateLimit(req, { name: "compose", agentId, perAgent: 30, perIp: 45 });
  if (limited) return limited;
  const repo = await getRepo();
  const classification = await classifyNoteBest(body.body);
  const lead = await repo.getLead(body.leadId);
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });
  if (lead.agent_id !== agentId) return NextResponse.json({ error: "lead not found" }, { status: 404 });

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
    {
      noteId: note.id,
      situation: classification.situation,
      confidence: classification.confidence,
      fieldSignal: extractFieldSignal(body.body),
    },
    "notes",
    body.leadId
  );

  const fieldCards = fieldSignalEvidence(body.body, classification);
  if (fieldCards.length > 0) {
    const existing = await repo.listEvidence(body.leadId);
    const stamped = fieldCards.map((card) => ({ ...card, lead_surface_id: body.leadId }));
    await repo.saveEvidence(body.leadId, [...existing, ...stamped]);
    await Promise.all(stamped.map((card) => persistEvidenceMemory(agentId, lead, card)));
  }

  // Persist the note as a memory row so the dispatcher can recall it next tap.
  // Failure is non-fatal — the loop must still complete even if embedding fails.
  try {
    await persistNoteMemory(note);
  } catch {
    /* memory persistence is best-effort */
  }

  return NextResponse.json({ note, classification });
});
