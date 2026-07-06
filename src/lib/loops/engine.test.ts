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

/** Grounded lead + a valid contact email so email drafts survive the
 *  pipeline's channel-required gate. Use this in any test that runs the
 *  draft→approve chain for an email artifact. */
async function groundedLeadWithEmail(address: string, lng: number, lat: number) {
  const bare = await groundedLead(address, lng, lat);
  const repo = await getRepo();
  await repo.upsertLead({ ...bare, contact: { email: "owner@example.test" } });
  return (await repo.getLead(bare.id))!;
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
    const lead = await groundedLeadWithEmail("221B Baker Street", -0.1574, 51.5237);
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
    const lead = await groundedLeadWithEmail("Plaka", 23.729, 37.9715);
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
    const lead = await groundedLeadWithEmail("Karen Road", 36.7073, -1.3318);
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

describe("awaiting_reply_days condition (reply-watch bump)", () => {
  const bumpDef = (agentId: string) => ({
    id: "loop-test-reply-watch",
    agent_id: agentId,
    name: "Reply watch · bump",
    description: "test",
    trigger: { event: "task.due" as const, match: { kind: "reply_check" } },
    conditions: [{ kind: "awaiting_reply_days" as const, value: 3 }],
    actions: [{ type: "email" as const, template: "reply_bump", requiresApproval: true }],
    cadence: { everyDays: 2 },
    active: true,
    created_at: new Date().toISOString(),
  });

  it("skips when there is no approved outbound email to chase", async () => {
    const lead = await groundedLeadWithEmail("40 Bump Court", -122.41, 37.77);
    const run = await runLoop(bumpDef(lead.agent_id), {
      lead,
      evidence: [],
      triggerSource: "test",
      artifacts: [],
      events: [],
    });
    expect(run.status).toBe("skipped_condition");
    expect(run.planner_trace.some((s) => s.detail.includes("No approved outbound email"))).toBe(true);
  });

  it("prepares a bump when an approved email is old with no reply, and stands down once a reply is logged", async () => {
    const repo = await getRepo();
    const lead = await groundedLeadWithEmail("41 Bump Court", -122.412, 37.771);
    const evidence = await repo.listEvidence(lead.id);
    const drafted = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence,
      trigger: "test",
    });
    await approveArtifact(drafted.id, drafted.revision);
    const approved = (await repo.getArtifact(drafted.id))!;
    const fourDaysAgo = new Date(Date.now() - 4 * 86400000).toISOString();
    const staleApproved = { ...approved, approved_at: fourDaysAgo, updated_at: fourDaysAgo };

    const due = await runLoop(bumpDef(lead.agent_id), {
      lead,
      evidence,
      triggerSource: "test",
      artifacts: [staleApproved],
      events: [],
    });
    expect(due.status).toBe("produced_artifact");

    const afterReply = await runLoop(bumpDef(lead.agent_id), {
      lead,
      evidence,
      triggerSource: "test",
      artifacts: [staleApproved],
      events: [
        {
          id: "evt-1",
          agent_id: lead.agent_id,
          lead_surface_id: lead.id,
          type: "email.reply" as const,
          payload: {},
          source: "operator",
          created_at: new Date().toISOString(),
        },
      ],
    });
    expect(afterReply.status).toBe("skipped_condition");
    expect(afterReply.planner_trace.some((s) => s.detail.includes("reply is already logged"))).toBe(true);
  });
});
