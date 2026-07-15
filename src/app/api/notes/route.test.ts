import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.FORLEADS_AGENT_MODE = "mock";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OLLAMA_URL;

vi.mock("@/lib/auth/agent", () => ({
  ensureCurrentAgent: async () => "00000000-0000-0000-0000-000000000001",
}));

import { POST } from "./route";
import { approveArtifact, ensureLead } from "@/lib/pipeline";
import { recallOutcomes } from "@/lib/agents/memory";
import { matchLoops, runLoop } from "@/lib/loops/engine";
import { getRepo } from "@/lib/db";
import { DEMO_AGENT_ID } from "@/lib/core/config";
import { resetIdempotencyLedger } from "@/lib/connectors";
import type { LoopDefinition } from "@/lib/core/types";

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
  resetIdempotencyLedger();
});

function post(body: unknown) {
  return new Request("http://localhost/api/notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
}

async function firstEmailArtifactId(run: { artifact_ids: string[] }) {
  const repo = await getRepo();
  for (const id of run.artifact_ids) {
    const artifact = await repo.getArtifact(id);
    if (artifact?.type === "email") return artifact.id;
  }
  throw new Error("loop run produced no email artifact");
}

describe("POST /api/notes", () => {
  it("is the real front door for note to field evidence to loop to approval to local-only connector to outcome memory", async () => {
    const repo = await getRepo();
    const created = await ensureLead(DEMO_AGENT_ID, {
      address: "99 Field Loop Ave",
      lng: -122.4469,
      lat: 37.7694,
    });
    await repo.upsertLead({
      ...created,
      contact: { email: "owner@example.test" },
    });

    const noteBody =
      "Knocked twice, no answer. The roof looks rough, tall grass, and mail piled up.";
    const res = await POST(post({ leadId: created.id, body: noteBody, modality: "text" }));
    const body = (await res.json()) as {
      classification: { situation: string; confidence: number };
      note: { id: string; body: string };
    };

    expect(res.status).toBe(200);
    expect(body.note.body).toBe(noteBody);
    expect(body.classification.situation).toBe("no_contact");

    const notes = await repo.listNotes(created.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.situation).toBe("no_contact");

    const evidence = await repo.listEvidence(created.id);
    expect(evidence.some((card) => card.claim === "Operator field condition")).toBe(true);
    expect(evidence.some((card) => card.claim === "Field photo" && card.confidence === "D")).toBe(true);

    const noteEvent = (await repo.listEvents(DEMO_AGENT_ID)).find(
      (event) => event.type === "note.created",
    );
    expect(noteEvent).toBeDefined();
    expect(noteEvent!.payload).toMatchObject({
      noteId: body.note.id,
      situation: "no_contact",
      fieldSignal: {
        observed_condition: expect.arrayContaining([
          "tall grass",
          "deferred maintenance",
          "mail piled up",
        ]),
      },
    });

    const defs = await repo.listLoopDefs(DEMO_AGENT_ID);
    const matched = matchLoops(defs, noteEvent!.type, noteEvent!.payload);
    expect(matched.map((d: LoopDefinition) => d.name)).toEqual(["No-contact follow-up"]);

    const lead = (await repo.getLead(created.id))!;
    const run = await runLoop(matched[0]!, {
      lead,
      situation: body.classification.situation as "no_contact",
      situationConfidence: body.classification.confidence,
      evidence,
      triggerSource: "note.created",
    });
    expect(run.status).toBe("produced_artifact");

    const artifactId = await firstEmailArtifactId(run);
    const draft = (await repo.getArtifact(artifactId))!;
    expect(draft.status).toBe("drafted");
    expect(draft.compliance_result.pass).toBe(true);

    const approved = await approveArtifact(draft.id, draft.revision, { agentId: draft.agent_id });
    expect(approved).toBeTruthy();
    expect(approved!.artifact.status).toBe("approved");
    expect(approved!.connector).toMatchObject({
      ok: true,
      mode: "mock",
      provider: "google",
      deduped: false,
    });
    expect(approved!.connector.externalId).toMatch(/^gmail_mock_/);

    const outcomes = await recallOutcomes(lead, "email");
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.ref).toBe(draft.id);
    expect(outcomes[0]!.text).toMatch(/^\[approved\] email:/);
  });
});
