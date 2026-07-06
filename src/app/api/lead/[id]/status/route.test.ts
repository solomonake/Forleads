import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Agent, LeadSurface } from "@/lib/core/types";
import { nowISO } from "@/lib/core/ids";
import { emptyStore, InMemoryRepository } from "@/lib/db/repository";

const state = vi.hoisted(() => ({
  agentId: "agent-a" as string | null,
  repo: undefined as unknown,
}));

vi.mock("@/lib/auth/agent", () => ({
  ensureCurrentAgent: async () => state.agentId,
}));

vi.mock("@/lib/db", () => ({
  getRepo: async () => state.repo,
}));

import { PATCH } from "./route";

const agent: Agent = {
  id: "agent-a",
  name: "Sam Rivera",
  email: "sam@example.com",
  signatureHtml: "<p>Sam</p>",
  brandVoice: "warm_local",
  locale: "en-US",
  mode: "crm",
};

function repo(): InMemoryRepository {
  return state.repo as InMemoryRepository;
}

function baseLead(overrides: Partial<LeadSurface> = {}): LeadSurface {
  return {
    id: "lead-1",
    agent_id: "agent-a",
    address: "22125 Clarksburg Road",
    lng: -77.29,
    lat: 39.22,
    h3_index: "h3",
    status: "researching",
    first_seen_at: nowISO(),
    last_worked_at: nowISO(),
    ...overrides,
  };
}

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/lead/lead-1/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "lead-1" }) };

describe("PATCH /api/lead/[id]/status", () => {
  beforeEach(async () => {
    state.agentId = "agent-a";
    state.repo = new InMemoryRepository(emptyStore());
    await repo().upsertAgent(agent);
    await repo().upsertLead(baseLead());
  });

  it("rejects unauthenticated callers", async () => {
    state.agentId = null;
    const res = await PATCH(request({ status: "dead" }), ctx);
    expect(res.status).toBe(401);
  });

  it("rejects unknown statuses", async () => {
    const res = await PATCH(request({ status: "vaporized" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 for a lead owned by another tenant", async () => {
    await repo().upsertLead(baseLead({ agent_id: "agent-b" }));
    const res = await PATCH(request({ status: "dead" }), ctx);
    expect(res.status).toBe(404);
  });

  it("archives and restores a lead the caller owns", async () => {
    const archive = await PATCH(request({ status: "dead" }), ctx);
    expect(archive.status).toBe(200);
    expect((await repo().getLead("lead-1"))?.status).toBe("dead");

    const restore = await PATCH(request({ status: "researching" }), ctx);
    expect(restore.status).toBe(200);
    expect((await repo().getLead("lead-1"))?.status).toBe("researching");
  });
});
