// ============================================================================
// outcome-v2.test.ts — the composer ACTUALLY reads outcomes it now has access
// to. A prior `rejected` outcome must change the next draft's subject + body
// AND tag the promptVersion as `-postreject`. A prior `approved` outcome
// (without rejection) tags the version as `-followup`. The trace surfaces
// priorOutcomes so the "Why this happened" panel can render it.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import {
  approveArtifact,
  draftArtifact,
  ensureLead,
  rejectArtifact,
  runSwarm,
} from "@/lib/pipeline";
import { summarizeOutcomes, recallOutcomes } from "./memory";
import { getRepo } from "@/lib/db";
import { DEMO_AGENT_ID } from "@/lib/core/config";
import { DEMO_AGENT } from "@/lib/db/seed";
import { resetIdempotencyLedger } from "@/lib/connectors";

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

async function groundedLead(address: string) {
  const lead = await ensureLead(DEMO_AGENT_ID, { address, lng: -73.99, lat: 40.75 });
  const swarm = await runSwarm(lead);
  return { lead: swarm.lead, evidence: swarm.summary.cards };
}

describe("summarizeOutcomes", () => {
  it("buckets approved/edited/rejected and surfaces lastRejectedAt", () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);
    const later = new Date(now.getTime() + 60_000);
    const s = summarizeOutcomes([
      { id: "1", agent_id: "a", lead_surface_id: "l", kind: "outcome", text: "[approved] email: x", embedding: [], created_at: now.toISOString() },
      { id: "2", agent_id: "a", lead_surface_id: "l", kind: "outcome", text: "[edited] email: x", embedding: [], created_at: now.toISOString() },
      { id: "3", agent_id: "a", lead_surface_id: "l", kind: "outcome", text: "[rejected] email: x", embedding: [], created_at: earlier.toISOString() },
      { id: "4", agent_id: "a", lead_surface_id: "l", kind: "outcome", text: "[rejected] email: x", embedding: [], created_at: later.toISOString() },
      { id: "5", agent_id: "a", lead_surface_id: "l", kind: "note", text: "ignore me", embedding: [], created_at: now.toISOString() },
    ]);
    expect(s).toEqual({
      approved: 1,
      edited: 1,
      rejected: 2,
      latestVerdict: "rejected",
      latestAt: later.toISOString(),
      lastRejectedAt: later.toISOString(),
    });
  });
});

describe("composer reads outcomes (deterministic path)", () => {
  it("tags promptVersion -postreject after a rejection AND changes the subject", async () => {
    const { lead, evidence } = await groundedLead("33 Outcome Loop");

    // First draft — no priors — base template.
    const first = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence,
      trigger: "test",
    });
    expect(first.model_trace.promptVersion).not.toMatch(/-postreject|-followup/);
    const firstSubject = (first.payload as { subject: string }).subject;

    // Reject it.
    await rejectArtifact(first.id, "Too pushy");

    // Second draft — must reflect the rejection.
    const second = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence,
      trigger: "test",
    });
    expect(second.model_trace.promptVersion).toMatch(/-postreject$/);
    const secondSubject = (second.payload as { subject: string }).subject;
    expect(secondSubject).not.toBe(firstSubject);
    expect(secondSubject).toMatch(/brief check-in/i);
    const secondBody = (second.payload as { body: string }).body;
    expect(secondBody).toMatch(/low-pressure/i);
    expect(secondBody).not.toMatch(/last note|didn't land|overstepped/i);
  });

  it("tags promptVersion -followup after an approval (no rejection)", async () => {
    const { lead, evidence } = await groundedLead("35 Followup Way");
    const first = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence,
      trigger: "test",
    });
    await approveArtifact(first.id);

    const second = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence,
      trigger: "test",
    });
    expect(second.model_trace.promptVersion).toMatch(/-followup$/);
    const body = (second.payload as { body: string }).body;
    expect(body).toMatch(/following up on my last note/i);
  });

  it("uses the latest verdict so an old rejection does not dominate a later approval", async () => {
    const { lead, evidence } = await groundedLead("36 Latest Verdict Way");
    const rejected = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence,
      trigger: "test",
    });
    await rejectArtifact(rejected.id, "Wrong angle");

    const replacement = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence,
      trigger: "test",
    });
    await approveArtifact(replacement.id);

    const next = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence,
      trigger: "test",
    });
    expect(next.model_trace.promptVersion).toMatch(/-followup$/);
  });
});

describe("agent trace surfaces priorOutcomes", () => {
  it("the trace returned for the artifact carries the priorOutcomes summary", async () => {
    const { lead, evidence } = await groundedLead("37 Trace Street");
    const first = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence,
      trigger: "test",
    });
    await rejectArtifact(first.id, "Wrong angle");

    const second = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence,
      trigger: "test",
    });

    const repo = await getRepo();
    const trace = await repo.getTraceForArtifact(second.id);
    expect(trace).toBeTruthy();
    expect(trace?.priorOutcomes).toBeDefined();
    expect(trace!.priorOutcomes!.rejected).toBe(1);
    expect(trace!.priorOutcomes!.approved).toBe(0);
    expect(trace!.priorOutcomes!.latestVerdict).toBe("rejected");
    expect(trace!.priorOutcomes!.lastRejectedAt).toBeDefined();
  });

  it("priorOutcomes is undefined on a truly fresh lead (no recall noise)", async () => {
    const { lead, evidence } = await groundedLead("39 Fresh Lane");
    const a = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence,
      trigger: "test",
    });
    const repo = await getRepo();
    const trace = await repo.getTraceForArtifact(a.id);
    expect(trace?.priorOutcomes).toBeUndefined();
  });
});

describe("recallOutcomes integration sanity", () => {
  it("returns 0 for a fresh lead; counts grow with each verdict", async () => {
    const { lead, evidence } = await groundedLead("41 Counter Court");
    expect((await recallOutcomes(lead, "email")).length).toBe(0);

    for (let i = 0; i < 3; i++) {
      const a = await draftArtifact({
        agent: DEMO_AGENT,
        lead,
        situation: "no_contact",
        situationConfidence: 0.9,
        actionType: "email",
        evidence,
        trigger: "test",
      });
      // alternate approve / reject
      if (i % 2 === 0) await approveArtifact(a.id);
      else await rejectArtifact(a.id, "no");
    }
    const memos = await recallOutcomes(lead, "email");
    expect(memos.length).toBe(3);
  });
});
