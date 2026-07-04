// ============================================================================
// pipeline.channel-required.test.ts — the composer must NOT build an outbound
// draft (email/SMS) with a friendly label as the recipient. Gmail returns 400
// on a non-RFC `To:` and Twilio rejects a non-phone `To:`.
//
// The pipeline gates this BEFORE the composer runs: draftArtifact must return
// a `blocked` artifact carrying a `contact_channel_missing` compliance flag,
// and the composer's own defensive check must throw if the pipeline is ever
// bypassed.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { compose } from "@/lib/agents/composer";
import { draftArtifact, ensureLead, runSwarm } from "@/lib/pipeline";
import { getRepo } from "@/lib/db";
import { DEMO_AGENT_ID } from "@/lib/core/config";
import { DEMO_AGENT } from "@/lib/db/seed";

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
});

async function groundedLeadWithoutContact(address: string) {
  const lead = await ensureLead(DEMO_AGENT_ID, {
    address,
    lng: -122.4469,
    lat: 37.7694,
  });
  const swarm = await runSwarm(lead);
  return swarm.lead;
}

describe("draftArtifact — channel-required gate", () => {
  it("returns a blocked artifact with contact_channel_missing when email is required but the lead has none", async () => {
    const lead = await groundedLeadWithoutContact("100 No Contact Ave");
    const artifact = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence: [],
      trigger: "test",
    });

    expect(artifact.status).toBe("blocked");
    expect(artifact.compliance_result.pass).toBe(false);
    expect(artifact.compliance_result.flags[0]?.category).toBe(
      "contact_channel_missing",
    );
    expect(artifact.compliance_result.flags[0]?.fix).toMatch(/owner email/i);
    // The payload must NOT carry a friendly-label To — either it's empty or a
    // valid address. This is what would have caused Gmail 400 before the fix.
    if ("to" in artifact.payload) {
      const to = (artifact.payload as { to: string }).to;
      expect(to).not.toMatch(/Owner ·/);
    }
  });

  it("returns a blocked artifact when sms is required but the lead has no phone", async () => {
    const lead = await groundedLeadWithoutContact("100 No Phone Ave");
    const artifact = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "sms",
      evidence: [],
      trigger: "test",
    });

    expect(artifact.status).toBe("blocked");
    expect(artifact.compliance_result.flags[0]?.category).toBe(
      "contact_channel_missing",
    );
    expect(artifact.compliance_result.flags[0]?.fix).toMatch(/owner phone/i);
  });

  it("still produces a real draft when a valid contact email exists", async () => {
    const bare = await groundedLeadWithoutContact("120 With Contact Ave");
    const repo = await getRepo();
    await repo.upsertLead({
      ...bare,
      contact: { email: "owner@example.test", name: "Sam Owner" },
    });
    const lead = (await repo.getLead(bare.id))!;

    const artifact = await draftArtifact({
      agent: DEMO_AGENT,
      lead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence: [],
      trigger: "test",
    });

    expect(artifact.status).toBe("drafted");
    // Now the composed `To:` is a real address, not a friendly label.
    const to = (artifact.payload as { to: string }).to;
    expect(to).toBe("owner@example.test");
  });
});

describe("composer — defense in depth (bypass the pipeline)", () => {
  it("throws if asked to build an email draft without a recipientEmail", () => {
    expect(() =>
      compose({
        agent: DEMO_AGENT,
        situation: "no_contact",
        actionType: "email",
        address: "130 Bypass Lane",
        recipientLabel: "Owner · 130 Bypass Lane",
        recipientEmail: undefined,
        recipientPhone: undefined,
        evidence: [],
      }),
    ).toThrow(/recipientEmail/);
  });

  it("throws if asked to build an SMS draft without a recipientPhone", () => {
    expect(() =>
      compose({
        agent: DEMO_AGENT,
        situation: "no_contact",
        actionType: "sms",
        address: "140 Bypass Lane",
        recipientLabel: "Owner · 140 Bypass Lane",
        recipientEmail: undefined,
        recipientPhone: undefined,
        evidence: [],
      }),
    ).toThrow(/recipientPhone/);
  });
});
