import { describe, it, expect, beforeEach } from "vitest";
import { getRepo } from "@/lib/db";
import { DEMO_AGENT_ID } from "@/lib/core/config";
import { ensureLead, runSwarm, draftArtifact, approveArtifact } from "@/lib/pipeline";
import { runLoop } from "./engine";
import { resetIdempotencyLedger } from "@/lib/connectors";
import { DEMO_AGENT } from "@/lib/db/seed";

async function groundedLead(address: string, lng: number, lat: number) {
  const lead = await ensureLead(DEMO_AGENT_ID, { address, lng, lat });
  const swarm = await runSwarm(lead);
  return swarm.lead;
}

describe("Action Loop Engine", () => {
  beforeEach(() => resetIdempotencyLedger());

  it("no-contact loop produces an inspectable artifact and logs the run", async () => {
    const repo = await getRepo();
    const grounded = await groundedLead("12 Oak Street", -122.4469, 37.7694);
    await repo.upsertLead({ ...grounded, contact: { email: "owner@example.test" } });
    const lead = (await repo.getLead(grounded.id))!;
    const def = await repo.getLoopDef("loop-no-contact");
    expect(def).toBeTruthy();

    const evidence = await repo.listEvidence(lead.id);
    const run = await runLoop(def!, {
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      evidence,
      triggerSource: "test",
    });

    expect(run.status).toBe("produced_artifact");
    expect(run.artifact_ids.length).toBeGreaterThan(0);
    expect(run.planner_trace.length).toBeGreaterThan(0);

    // The run is persisted (logged).
    const runs = await repo.listLoopRuns(DEMO_AGENT_ID);
    expect(runs.find((r) => r.id === run.id)).toBeTruthy();

    // The produced artifact exists and is a draft (not sent).
    const artifact = await repo.getArtifact(run.artifact_ids[0]!);
    expect(artifact).toBeTruthy();
    expect(["drafted", "blocked"]).toContain(artifact!.status);
  });

  it("skips on a failing condition (opt-out) and logs why", async () => {
    const repo = await getRepo();
    const lead = await groundedLead("8 Pine Road", -97.7431, 30.2672);
    // Force opt-out.
    await repo.upsertLead({ ...lead, contact: { ...lead.contact, optOutEmail: true } });
    const optedLead = (await repo.getLead(lead.id))!;
    const def = await repo.getLoopDef("loop-no-contact");

    const run = await runLoop(def!, {
      lead: optedLead,
      situation: "no_contact",
      situationConfidence: 0.9,
      evidence: await repo.listEvidence(lead.id),
      triggerSource: "test",
    });
    expect(run.status).toBe("skipped_condition");
    expect(run.planner_trace.some((s) => s.outcome === "fail")).toBe(true);
    expect(run.artifact_ids).toHaveLength(0);
  });

  it("skips honestly when no contact channel exists", async () => {
    const repo = await getRepo();
    const lead = await groundedLead("4 Honest Gap Way", -71.1, 42.3);
    const def = await repo.getLoopDef("loop-no-contact");
    const run = await runLoop(def!, {
      lead,
      situation: "no_contact",
      evidence: await repo.listEvidence(lead.id),
      triggerSource: "test",
    });
    expect(run.status).toBe("skipped_condition");
    expect(run.planner_trace.some((step) => step.detail.includes("No contact channel"))).toBe(true);
  });
});

describe("draft state transitions + human gate", () => {
  beforeEach(() => resetIdempotencyLedger());

  it("draft → approve transitions an email to approved with an external draft ref", async () => {
    const repo = await getRepo();
    const lead = await groundedLead("221B Baker Street", -0.1574, 51.5237);
    const evidence = await repo.listEvidence(lead.id);
    const artifact = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence,
      trigger: "test",
    });
    expect(artifact.status).toBe("drafted");

    const result = await approveArtifact(artifact.id, artifact.revision);
    expect(result).toBeTruthy();
    expect(result!.artifact.status).toBe("approved");
    expect(result!.artifact.external_draft_ref).toBeTruthy();
    expect(result!.connector.ok).toBe(true);
  });

  it("approving twice is idempotent (no duplicate connector write)", async () => {
    const repo = await getRepo();
    const lead = await groundedLead("Plaka", 23.729, 37.9715);
    const artifact = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence: await repo.listEvidence(lead.id),
      trigger: "test",
    });
    const a = await approveArtifact(artifact.id, artifact.revision);
    resetIdempotencyLedger(); // simulate a cold server instance
    const b = await approveArtifact(artifact.id, artifact.revision);
    expect(b!.connector.deduped).toBe(true);
    expect(a!.connector.externalId).toBe(b!.connector.externalId);
  });

  it("an Agent Trace is created for every draft", async () => {
    const repo = await getRepo();
    const lead = await groundedLead("Karen Road", 36.7073, -1.3318);
    const artifact = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence: await repo.listEvidence(lead.id),
      trigger: "note.created",
    });
    const trace = await repo.getTraceForArtifact(artifact.id);
    expect(trace).toBeTruthy();
    expect(trace!.trigger).toBe("note.created");
    expect(trace!.policy.some((p) => p.name === "fair_housing")).toBe(true);
  });
});
