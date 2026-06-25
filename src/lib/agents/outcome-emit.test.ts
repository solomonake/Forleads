// Regression: outcome.recorded MUST emit even when persistOutcomeMemory falls
// back to null (e.g., the memory table is unavailable). The verdict is the
// human-gate signal; observability must always see it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveArtifact,
  draftArtifact,
  ensureLead,
  rejectArtifact,
  runSwarm,
} from "@/lib/pipeline";
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
  vi.restoreAllMocks();
});

async function poisonSaveMemoryAfterSetup() {
  // Build the in-memory repo by touching it once, then wrap saveMemory to
  // reject so outcome persist falls back to null. ALL OTHER repo methods are
  // untouched so the rest of the approve flow still works end-to-end.
  const repo = await getRepo();
  vi.spyOn(repo, "saveMemory").mockRejectedValue(
    new Error("simulated: memory unavailable"),
  );
}

describe("outcome.recorded always emits, even when persist fails", () => {
  it("approveArtifact still emits outcome.recorded with persisted=false", async () => {
    const lead = await ensureLead(DEMO_AGENT_ID, {
      address: "1 Persist-Fail Lane",
      lng: -73.99,
      lat: 40.75,
    });
    const swarm = await runSwarm(lead);
    const artifact = await draftArtifact({
      agent: DEMO_AGENT,
      lead: swarm.lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence: swarm.summary.cards,
      trigger: "test",
    });
    if (artifact.status === "blocked") throw new Error("setup blocked");

    await poisonSaveMemoryAfterSetup();
    await approveArtifact(artifact.id, artifact.revision);

    const repo = await getRepo();
    const events = (await repo.listEvents(DEMO_AGENT_ID)).filter(
      (e) => e.type === "outcome.recorded",
    );
    expect(events.length).toBe(1);
    const payload = events[0]!.payload as {
      verdict: string;
      persisted: boolean;
      memoryId?: string;
    };
    expect(payload.verdict).toBe("approved");
    expect(payload.persisted).toBe(false);
    expect(payload.memoryId).toBeUndefined();
  });

  it("rejectArtifact still emits outcome.recorded with persisted=false", async () => {
    const lead = await ensureLead(DEMO_AGENT_ID, {
      address: "2 Persist-Fail Reject Lane",
      lng: -73.99,
      lat: 40.75,
    });
    const swarm = await runSwarm(lead);
    const artifact = await draftArtifact({
      agent: DEMO_AGENT,
      lead: swarm.lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence: swarm.summary.cards,
      trigger: "test",
    });
    if (artifact.status === "blocked") throw new Error("setup blocked");

    await poisonSaveMemoryAfterSetup();
    await rejectArtifact(artifact.id, "Too generic");

    const repo = await getRepo();
    const events = (await repo.listEvents(DEMO_AGENT_ID)).filter(
      (e) => e.type === "outcome.recorded",
    );
    expect(events.length).toBe(1);
    const payload = events[0]!.payload as {
      verdict: string;
      persisted: boolean;
      reason: string | null;
      memoryId?: string;
    };
    expect(payload.verdict).toBe("rejected");
    expect(payload.persisted).toBe(false);
    expect(payload.reason).toBe("Too generic");
    expect(payload.memoryId).toBeUndefined();
  });
});
