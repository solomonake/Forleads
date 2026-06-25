import { buildTrace } from "@/lib/agents/trace";
import { lintArtifactText } from "@/lib/agents/compliance";
import type { Artifact, ArtifactPayload } from "@/lib/core/types";
import { nowISO } from "@/lib/core/ids";
import { getRepo } from "@/lib/db";
import { emit } from "@/lib/pipeline";

function textParts(payload: ArtifactPayload): string[] {
  const record = payload as unknown as Record<string, unknown>;
  return ["subject", "body", "title", "notes"]
    .filter((key) => typeof record[key] === "string")
    .map((key) => String(record[key]));
}

function editHistory(
  artifact: Artifact,
  payload: ArtifactPayload,
): NonNullable<Artifact["edit_history"]> {
  const before = artifact.payload as unknown as Record<string, unknown>;
  const after = payload as unknown as Record<string, unknown>;
  const at = nowISO();
  const edits = Object.keys({ ...before, ...after }).flatMap((field) => {
    const oldValue = String(before[field] ?? "");
    const newValue = String(after[field] ?? "");
    return oldValue === newValue
      ? []
      : [{ at, field, before: oldValue, after: newValue }];
  });
  return [...(artifact.edit_history ?? []), ...edits];
}

export async function reviseArtifact(input: {
  artifactId: string;
  agentId: string;
  expectedRevision: number;
  payload: ArtifactPayload;
}): Promise<Artifact | null> {
  const repo = await getRepo();
  const artifact = await repo.getArtifact(input.artifactId);
  if (!artifact || artifact.agent_id !== input.agentId) return null;
  if (artifact.revision !== input.expectedRevision) {
    throw new Error(
      `Artifact changed since editing began (expected revision ${input.expectedRevision}, current ${artifact.revision}).`
    );
  }

  const compliance = lintArtifactText(textParts(input.payload));
  const updatedAt = nowISO();
  const updated = await repo.updateArtifactAtRevision(artifact.id, artifact.revision, {
    payload: input.payload,
    compliance_result: compliance,
    status: compliance.pass ? "drafted" : "blocked",
    revision: artifact.revision + 1,
    updated_at: updatedAt,
    approved_at: undefined,
    approved_revision: undefined,
    sent_at: undefined,
    external_draft_ref: undefined,
    edit_history: editHistory(artifact, input.payload),
  });
  if (!updated) {
    throw new Error("Artifact changed concurrently; reload before saving.");
  }

  const priorTrace = await repo.getTraceForArtifact(artifact.id);
  const trace = buildTrace({
    agentId: artifact.agent_id,
    artifact: updated,
    loopRunId: artifact.loop_run_id,
    trigger: "artifact.edited",
    situation: priorTrace?.situation,
    situationConfidence: priorTrace?.situationConfidence,
    evidenceUsed: artifact.evidence_used,
    excluded: priorTrace?.excluded ?? [],
    compliance,
    cost: priorTrace?.cost ?? { claudeCalls: 0, paidDataCalls: 0, ms: 0 },
  });
  trace.id = artifact.trace_id ?? trace.id;
  await repo.saveTrace(trace);
  await emit(
    artifact.agent_id,
    "artifact.edited",
    { artifactId: artifact.id, revision: updated.revision },
    "artifact-revision",
    artifact.lead_surface_id,
  );
  return updated;
}
