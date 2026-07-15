import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyStore, InMemoryRepository } from "@/lib/db/repository";
import { nowISO } from "@/lib/core/ids";
import type { Agent, LeadSurface } from "@/lib/core/types";

const state = vi.hoisted(() => ({ repo: undefined as unknown }));
vi.mock("@/lib/db", () => ({ getRepo: async () => state.repo }));

import { approveArtifact, draftArtifact } from "./pipeline";

const agent = (id: string): Agent => ({
  id,
  name: id,
  email: `${id}@example.com`,
  signatureHtml: "",
  brandVoice: "warm_local",
  locale: "en-US",
  mode: "crm",
});
const lead = (id: string, agentId: string): LeadSurface => ({
  id,
  agent_id: agentId,
  lng: -97.5,
  lat: 35.5,
  address: "100 Boundary St, Oklahoma City, OK 73102",
  h3_index: "h3",
  status: "researching",
  contact: { email: "known@example.com" },
  first_seen_at: nowISO(),
  last_worked_at: nowISO(),
});

describe("pipeline tenant boundaries", () => {
  beforeEach(() => {
    state.repo = new InMemoryRepository(emptyStore());
    vi.restoreAllMocks();
  });

  it("rejects cross-tenant drafting as defense in depth", async () => {
    await expect(draftArtifact({
      agent: agent("agent-b"),
      lead: lead("lead-a", "agent-a"),
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence: [],
      trigger: "test",
    })).rejects.toThrow(/tenant boundaries/);
  });

  it("returns the same not-found result before a cross-tenant approval can fetch", async () => {
    const repo = state.repo as InMemoryRepository;
    const owner = agent("agent-a");
    const ownedLead = lead("lead-a", owner.id);
    await repo.upsertAgent(owner);
    await repo.upsertLead(ownedLead);
    const artifact = await draftArtifact({
      agent: owner,
      lead: ownedLead,
      situation: "no_contact",
      situationConfidence: 0.9,
      actionType: "email",
      evidence: [],
      trigger: "test",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    expect(await approveArtifact(artifact.id, artifact.revision, { agentId: "agent-b" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
