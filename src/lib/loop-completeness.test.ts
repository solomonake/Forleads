// ============================================================================
// loop-completeness.test.ts — Phase C of .agent/plans/product-completion-loop.md.
//
// ONE deterministic test proves the whole product workflow with zero external
// side effects (mock connector adapters, deterministic classifier/composer):
//
//   field note → classification → loop trigger match → loop run → draft
//   artifact → human approval → connector result → outcome memory → the NEXT
//   loop run reads that memory (priorOutcomes in the trace) → analytics report.
//
// Every seam here also has its own focused suite (notes, engine, pipeline,
// revise, idempotency, outcome, analytics); this file exists to prove the
// seams actually compose end to end.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { approveArtifact, emit, ensureLead, runSwarm } from "@/lib/pipeline";
import { classifyNoteBest } from "@/lib/agents/notes";
import { recallOutcomes } from "@/lib/agents/memory";
import { matchLoops, runLoop } from "@/lib/loops/engine";
import { deriveLoopAnalytics } from "@/lib/loops/analytics";
import { getRepo } from "@/lib/db";
import { DEMO_AGENT_ID } from "@/lib/core/config";
import { nowISO, uuid } from "@/lib/core/ids";
import { resetIdempotencyLedger } from "@/lib/connectors";
import type { Artifact, LoopDefinition } from "@/lib/core/types";

interface RepoGlobal {
  __forleadsRepo?: unknown;
  __forleadsSeeded?: unknown;
  __forleadsCache?: unknown;
}

const g = globalThis as unknown as RepoGlobal;

beforeEach(() => {
  g.__forleadsRepo = undefined;
  g.__forleadsSeeded = undefined;
  g.__forleadsCache = undefined;
  delete process.env.OLLAMA_URL;
  resetIdempotencyLedger();
});

async function emailArtifactOf(run: { artifact_ids: string[] }): Promise<Artifact> {
  const repo = await getRepo();
  for (const id of run.artifact_ids) {
    const artifact = await repo.getArtifact(id);
    if (artifact?.type === "email") return artifact;
  }
  throw new Error("loop run produced no email artifact");
}

describe("product completion loop (end to end, deterministic)", () => {
  it("note → classification → loop → artifact → approval → connector → outcome memory → next run → report", async () => {
    const repo = await getRepo();

    // 1. A lead exists with grounded evidence and a reachable contact channel.
    const bare = await ensureLead(DEMO_AGENT_ID, {
      address: "42 Completion Way",
      lng: -122.4469,
      lat: 37.7694,
    });
    const swarm = await runSwarm(bare);
    await repo.upsertLead({ ...swarm.lead, contact: { email: "owner@example.test" } });
    const lead = (await repo.getLead(swarm.lead.id))!;

    // 2. A field note is classified — deterministic path (no live model in tests).
    const noteBody = "Knocked twice, no answer. Left a card in the door.";
    const classification = await classifyNoteBest(noteBody);
    expect(classification.situation).toBe("no_contact");

    const note = await repo.addNote({
      id: uuid(),
      lead_surface_id: lead.id,
      agent_id: DEMO_AGENT_ID,
      body: noteBody,
      modality: "text",
      situation: classification.situation,
      created_at: nowISO(),
    });
    await emit(
      DEMO_AGENT_ID,
      "note.created",
      { noteId: note.id, situation: classification.situation, confidence: classification.confidence },
      "notes",
      lead.id,
    );

    // 3. The note event matches exactly the seeded no-contact loop via the
    //    real trigger matcher — not by hand-picking the definition.
    const defs = await repo.listLoopDefs(DEMO_AGENT_ID);
    const matched = matchLoops(defs, "note.created", { situation: classification.situation });
    expect(matched.map((d: LoopDefinition) => d.name)).toEqual(["No-contact follow-up"]);
    const def = matched[0]!;

    // 4. The loop run produces an inspectable draft — nothing is sent.
    const evidence = await repo.listEvidence(lead.id);
    const run1 = await runLoop(def, {
      lead,
      situation: "no_contact",
      situationConfidence: classification.confidence,
      evidence,
      triggerSource: "note.created",
    });
    expect(run1.status).toBe("produced_artifact");
    const draft = await emailArtifactOf(run1);
    expect(draft.status).toBe("drafted");
    expect(draft.compliance_result.pass).toBe(true);

    // 5. Human approval yields a connector result. In tests the adapter is the
    //    local mock — an external ref with no real outbound write.
    const approved = await approveArtifact(draft.id, draft.revision);
    expect(approved).toBeTruthy();
    expect(approved!.artifact.status).toBe("approved");
    expect(approved!.artifact.approved_revision).toBe(draft.revision);
    expect(approved!.connector.ok).toBe(true);
    expect(approved!.connector.deduped).toBe(false);

    // 6. The approval landed in outcome memory and is recallable for this lead.
    const outcomes = await recallOutcomes(lead, "email");
    expect(outcomes.length).toBe(1);
    expect(outcomes[0]!.text.startsWith("[approved] email:")).toBe(true);
    expect(outcomes[0]!.ref).toBe(draft.id);

    // 7. The NEXT loop cycle runs and its draft provably reads the outcome
    //    memory: the agent trace carries the priorOutcomes summary.
    const run2 = await runLoop(def, {
      lead: (await repo.getLead(lead.id))!,
      situation: "no_contact",
      situationConfidence: classification.confidence,
      evidence: await repo.listEvidence(lead.id),
      triggerSource: "note.created",
    });
    expect(run2.status).toBe("produced_artifact");
    const nextDraft = await emailArtifactOf(run2);
    const trace = await repo.getTraceForArtifact(nextDraft.id);
    expect(trace?.priorOutcomes).toBeDefined();
    expect(trace!.priorOutcomes!.approved).toBe(1);
    expect(trace!.priorOutcomes!.latestVerdict).toBe("approved");

    // 8. The report reflects the whole cycle: two runs, drafts produced, one
    //    human approval — inspectable, not inferred.
    const analytics = deriveLoopAnalytics({
      definitions: [def],
      runs: await repo.listLoopRuns(DEMO_AGENT_ID),
      artifacts: await repo.listArtifacts(DEMO_AGENT_ID),
      events: await repo.listEvents(DEMO_AGENT_ID),
    });
    const report = analytics[def.id];
    expect(report).toBeDefined();
    expect(report!.runs).toBe(2);
    expect(report!.produced).toBe(2);
    expect(report!.approved).toBe(1);
  });
});
