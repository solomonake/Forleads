// ============================================================================
// outcome.test.ts — the human gate writes outcome memories.
//
// approveArtifact → outcome memory with verdict="approved".
// reviseArtifact + approveArtifact at the new revision → "edited".
// rejectArtifact → "rejected" + artifact.cancelled.
// recallOutcomes filters by actionType and surfaces only outcome-kind rows.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import {
  approveArtifact,
  draftArtifact,
  ensureLead,
  rejectArtifact,
  runSwarm,
} from "@/lib/pipeline";
import { recallOutcomes } from "./memory";
import { getRepo } from "@/lib/db";
import { DEMO_AGENT_ID } from "@/lib/core/config";
import { DEMO_AGENT } from "@/lib/db/seed";
import { resetIdempotencyLedger } from "@/lib/connectors";
import { reviseArtifact } from "@/lib/artifacts/revise";
import type { EmailPayload } from "@/lib/core/types";

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

async function setup(address: string) {
  const lead = await ensureLead(DEMO_AGENT_ID, {
    address,
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
  return { lead: swarm.lead, artifact };
}

describe("approveArtifact → outcome memory", () => {
  it("writes a `[approved] email:` outcome memory and emits outcome.recorded", async () => {
    const { lead, artifact } = await setup("11 Approved Ave");
    if (artifact.status === "blocked") {
      // The deterministic composer should produce a clean draft; if it ever
      // blocks, the test setup needs adjusting, not the test logic.
      throw new Error(`setup produced a blocked artifact: ${JSON.stringify(artifact.compliance_result.flags)}`);
    }
    await approveArtifact(artifact.id, artifact.revision);

    const repo = await getRepo();
    const events = (await repo.listEvents(DEMO_AGENT_ID)).filter(
      (e) => e.type === "outcome.recorded",
    );
    expect(events.length).toBe(1);
    expect((events[0]!.payload as { verdict: string }).verdict).toBe("approved");

    const outcomes = await recallOutcomes(lead, "email");
    expect(outcomes.length).toBe(1);
    expect(outcomes[0]!.text.startsWith("[approved] email:")).toBe(true);
    expect(outcomes[0]!.ref).toBe(artifact.id);
  });
});

describe("approveArtifact after revision", () => {
  it("writes an `[edited]` outcome memory and records the edit in edit_history", async () => {
    const { lead, artifact } = await setup("13 Edited Lane");
    if (artifact.status === "blocked") throw new Error("setup blocked");
    const edited = "Hi — quick neighborhood note for you. I trimmed this myself.";
    const revised = await reviseArtifact({
      artifactId: artifact.id,
      agentId: DEMO_AGENT_ID,
      expectedRevision: artifact.revision,
      payload: { ...(artifact.payload as EmailPayload), body: edited },
    });
    if (!revised) throw new Error("revision failed");
    await approveArtifact(revised.id, revised.revision);

    const repo = await getRepo();
    const after = await repo.getArtifact(artifact.id);
    expect(after?.edit_history?.length).toBe(1);
    expect(after?.edit_history?.[0]?.field).toBe("body");
    expect(after?.edit_history?.[0]?.after).toBe(edited);

    const outcomes = await recallOutcomes(lead, "email");
    expect(outcomes.length).toBe(1);
    expect(outcomes[0]!.text.startsWith("[edited] email:")).toBe(true);
    // The edited tail must include the user's edit excerpt.
    expect(outcomes[0]!.text).toContain("trimmed this myself");
  });

  it("does NOT mark `edited` if the user's body matches the original verbatim", async () => {
    const { lead, artifact } = await setup("15 Unchanged Way");
    if (artifact.status === "blocked") throw new Error("setup blocked");
    await approveArtifact(artifact.id, artifact.revision);

    const outcomes = await recallOutcomes(lead, "email");
    expect(outcomes.length).toBe(1);
    expect(outcomes[0]!.text.startsWith("[approved] email:")).toBe(true);
  });

  it("uses a new connector idempotency key when the approved payload changes", async () => {
    const { artifact } = await setup("16 Revision Key Way");
    if (artifact.status === "blocked") throw new Error("setup blocked");

    const first = await approveArtifact(artifact.id, artifact.revision);
    const edited = "A materially different approved body.";
    const revised = await reviseArtifact({
      artifactId: artifact.id,
      agentId: DEMO_AGENT_ID,
      expectedRevision: artifact.revision,
      payload: { ...(artifact.payload as EmailPayload), body: edited },
    });
    if (!revised) throw new Error("revision failed");
    const second = await approveArtifact(revised.id, revised.revision);

    expect(first?.connector.deduped).toBe(false);
    expect(second?.connector.deduped).toBe(false);
    expect(second?.artifact.external_draft_ref?.idempotencyKey).not.toBe(
      first?.artifact.external_draft_ref?.idempotencyKey,
    );
  });

  it("does not approve or record an outcome when the connector write fails", async () => {
    const { lead, artifact } = await setup("16 Failed Connector Way");
    if (artifact.status === "blocked") throw new Error("setup blocked");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("nope", { status: 503 });

    try {
      await expect(
        approveArtifact(artifact.id, artifact.revision, {
          googleAccessToken: "expired-token",
        }),
      ).rejects.toThrow(/Connector write failed/);
    } finally {
      globalThis.fetch = originalFetch;
    }

    const repo = await getRepo();
    expect((await repo.getArtifact(artifact.id))?.status).toBe("drafted");
    expect(await recallOutcomes(lead, "email")).toHaveLength(0);
  });
});

describe("rejectArtifact → outcome memory + cancellation", () => {
  it("flips status to cancelled, records reason, writes `[rejected]` outcome", async () => {
    const { lead, artifact } = await setup("17 Reject Court");
    if (artifact.status === "blocked") throw new Error("setup blocked");
    const res = await rejectArtifact(artifact.id, "Too pushy for a first touch.");

    expect(res?.artifact.status).toBe("cancelled");

    const repo = await getRepo();
    const events = await repo.listEvents(DEMO_AGENT_ID);
    expect(events.some((e) => e.type === "artifact.cancelled")).toBe(true);
    const outRecorded = events.filter((e) => e.type === "outcome.recorded");
    expect(outRecorded.length).toBe(1);
    expect((outRecorded[0]!.payload as { verdict: string }).verdict).toBe("rejected");

    const outcomes = await recallOutcomes(lead, "email");
    expect(outcomes.length).toBe(1);
    expect(outcomes[0]!.text.startsWith("[rejected] email:")).toBe(true);
    expect(outcomes[0]!.text).toContain('reason="Too pushy for a first touch."');
  });

  it("is idempotent — rejecting a cancelled artifact does not write a second memory", async () => {
    const { lead, artifact } = await setup("19 Idem Loop");
    if (artifact.status === "blocked") throw new Error("setup blocked");
    await rejectArtifact(artifact.id, "first");
    await rejectArtifact(artifact.id, "second");
    const outcomes = await recallOutcomes(lead, "email");
    expect(outcomes.length).toBe(1);
  });
});

describe("recallOutcomes filters", () => {
  it("returns only outcome-kind memories for the lead", async () => {
    const { lead, artifact } = await setup("21 Filter St");
    if (artifact.status === "blocked") throw new Error("setup blocked");
    await approveArtifact(artifact.id, artifact.revision);

    // The lead also has evidence + note memories floating around; recallOutcomes
    // must NOT surface them.
    const outcomes = await recallOutcomes(lead);
    expect(outcomes.every((m) => m.kind === "outcome")).toBe(true);
    expect(outcomes.length).toBeGreaterThan(0);
  });
});
