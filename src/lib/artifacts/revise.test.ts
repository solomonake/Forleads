import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_AGENT_ID } from "@/lib/core/config";
import { resetIdempotencyLedger } from "@/lib/connectors";
import { getRepo } from "@/lib/db";
import { DEMO_AGENT } from "@/lib/db/seed";
import { approveArtifact, draftArtifact, ensureLead } from "@/lib/pipeline";
import { reviseArtifact } from "./revise";
import type { EmailPayload } from "@/lib/core/types";

describe("artifact revision safety", () => {
  beforeEach(() => resetIdempotencyLedger());

  it("persists an edit, increments revision, reruns compliance, and rejects stale approval", async () => {
    const repo = await getRepo();
    const lead = await ensureLead(DEMO_AGENT_ID, {
      address: "9 Revision Lane",
      lng: -73.9,
      lat: 40.7,
    });
    const artifact = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence: [],
      trigger: "test",
    });
    const payload = artifact.payload as EmailPayload;
    const revised = await reviseArtifact({
      artifactId: artifact.id,
      agentId: DEMO_AGENT_ID,
      expectedRevision: artifact.revision,
      payload: { ...payload, body: `${payload.body}\nGreat for families.` },
    });

    expect(revised?.revision).toBe(2);
    expect(revised?.status).toBe("blocked");
    expect(revised?.edit_history?.length).toBeGreaterThan(0);
    await expect(approveArtifact(artifact.id, 1)).rejects.toThrow(/revision/);
  });

  it("uses the revision in connector idempotency", async () => {
    const repo = await getRepo();
    const lead = await ensureLead(DEMO_AGENT_ID, {
      address: "10 Revision Lane",
      lng: -73.91,
      lat: 40.71,
    });
    const artifact = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence: await repo.listEvidence(lead.id),
      trigger: "test",
    });
    const first = await approveArtifact(artifact.id, artifact.revision);
    expect(first?.artifact.approved_revision).toBe(artifact.revision);
    expect(first?.artifact.external_draft_ref?.idempotencyKey).toBeTruthy();
  });
});
