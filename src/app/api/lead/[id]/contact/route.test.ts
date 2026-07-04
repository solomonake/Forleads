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
  requireAgentId: async () => state.agentId,
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
    lng: -73.1,
    lat: 40.1,
    address: "12 Oak St",
    h3_index: "h3",
    status: "researching",
    first_seen_at: nowISO(),
    last_worked_at: nowISO(),
    ...overrides,
  };
}

function patch(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/lead/${id}/contact`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedLead(overrides: Partial<LeadSurface> = {}) {
  await repo().upsertAgent(agent);
  await repo().upsertLead(baseLead(overrides));
}

describe("PATCH /api/lead/[id]/contact", () => {
  beforeEach(() => {
    state.agentId = "agent-a";
    state.repo = new InMemoryRepository(emptyStore());
  });

  it("rejects unauthenticated callers", async () => {
    state.agentId = null;
    await seedLead();
    const res = await PATCH(patch("lead-1", { email: "owner@example.test" }), {
      params: Promise.resolve({ id: "lead-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a lead owned by another tenant", async () => {
    await seedLead({ agent_id: "agent-b" });
    const res = await PATCH(patch("lead-1", { email: "owner@example.test" }), {
      params: Promise.resolve({ id: "lead-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for a missing lead (does not leak existence)", async () => {
    const res = await PATCH(patch("missing", { email: "owner@example.test" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("persists email + phone + name and returns the updated lead", async () => {
    await seedLead();
    const res = await PATCH(
      patch("lead-1", {
        name: "Pat Owner",
        email: "pat@example.test",
        phone: "+1 415 555 0100",
      }),
      { params: Promise.resolve({ id: "lead-1" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lead: LeadSurface };
    expect(body.lead.contact).toEqual({
      name: "Pat Owner",
      email: "pat@example.test",
      phone: "+1 415 555 0100",
    });
    const stored = await repo().getLead("lead-1");
    expect(stored?.contact?.email).toBe("pat@example.test");
  });

  it("merges partial updates (omitted fields keep their prior values)", async () => {
    await seedLead({ contact: { name: "Old Name", email: "old@example.test" } });
    const res = await PATCH(patch("lead-1", { phone: "555-1234" }), {
      params: Promise.resolve({ id: "lead-1" }),
    });
    expect(res.status).toBe(200);
    const stored = await repo().getLead("lead-1");
    expect(stored?.contact?.name).toBe("Old Name");
    expect(stored?.contact?.email).toBe("old@example.test");
    expect(stored?.contact?.phone).toBe("555-1234");
  });
});
