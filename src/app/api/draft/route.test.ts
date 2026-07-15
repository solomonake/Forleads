import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { nowISO } from "@/lib/core/ids";
import type { LeadSurface } from "@/lib/core/types";

const mocks = vi.hoisted(() => ({
  agentId: "agent-b" as string | null,
  listEvidence: vi.fn(),
  getAgent: vi.fn(),
  draftArtifact: vi.fn(),
}));

const foreignLead: LeadSurface = {
  id: "lead-a",
  agent_id: "agent-a",
  lng: -97.5,
  lat: 35.5,
  address: "100 Boundary St, Oklahoma City, OK 73102",
  h3_index: "h3",
  status: "researching",
  first_seen_at: nowISO(),
  last_worked_at: nowISO(),
};

vi.mock("@/lib/auth/agent", () => ({ ensureCurrentAgent: async () => mocks.agentId }));
vi.mock("@/lib/db", () => ({
  getRepo: async () => ({
    getLead: async () => foreignLead,
    listEvidence: mocks.listEvidence,
    getAgent: mocks.getAgent,
  }),
}));
vi.mock("@/lib/pipeline", () => ({ draftArtifact: mocks.draftArtifact }));

import { POST } from "./route";

function request() {
  return new NextRequest("http://localhost/api/draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      leadId: "lead-a",
      situation: "no_contact",
      actionType: "email",
    }),
  });
}

describe("POST /api/draft tenant boundary", () => {
  beforeEach(() => {
    mocks.agentId = "agent-b";
    mocks.listEvidence.mockReset();
    mocks.getAgent.mockReset();
    mocks.draftArtifact.mockReset();
  });

  it("returns non-leaking 404 without reading evidence or composing", async () => {
    const res = await POST(request());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "lead not found" });
    expect(mocks.listEvidence).not.toHaveBeenCalled();
    expect(mocks.getAgent).not.toHaveBeenCalled();
    expect(mocks.draftArtifact).not.toHaveBeenCalled();
  });
});
