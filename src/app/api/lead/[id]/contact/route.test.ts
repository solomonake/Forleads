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
    expect(body.lead.contact).toMatchObject({
      name: "Pat Owner",
      email: "pat@example.test",
      phone: "+1 415 555 0100",
      source: "agent_entered",
    });
    expect(body.lead.contact?.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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

  it("persists source and channel permission while keeping provider refs internal", async () => {
    await seedLead({
      contact: { providerRefs: { followupboss: "existing-person-123" } },
    });
    const res = await PATCH(patch("lead-1", {
      name: "Known Person",
      email: "known@example.test",
      phone: "+1 405 555 0100",
      source: "first_party",
      sourceLabel: "Open-house sign-in",
      emailPermission: "allowed",
      smsPermission: "opted_out",
      callPermission: "unknown",
      providerRefs: { followupboss: "attacker-controlled" },
    }), { params: Promise.resolve({ id: "lead-1" }) });

    expect(res.status).toBe(200);
    const stored = await repo().getLead("lead-1");
    expect(stored?.contact).toMatchObject({
      source: "first_party",
      sourceLabel: "Open-house sign-in",
      emailPermission: "allowed",
      optOutEmail: false,
      smsPermission: "opted_out",
      optOutSms: true,
      callPermission: "unknown",
      providerRefs: { followupboss: "existing-person-123" },
    });
  });

  it("rejects attempts to mark a manual contact as CRM-imported", async () => {
    await seedLead();
    const res = await PATCH(patch("lead-1", { source: "crm" }), {
      params: Promise.resolve({ id: "lead-1" }),
    });

    expect(res.status).toBe(400);
  });

  it("keeps connector provenance immutable through the manual endpoint", async () => {
    await seedLead({
      contact: {
        source: "crm",
        sourceLabel: "Follow Up Boss",
        providerRefs: { followupboss: "person-123" },
      },
    });
    const res = await PATCH(patch("lead-1", {
      source: "first_party",
      sourceLabel: "fabricated",
    }), { params: Promise.resolve({ id: "lead-1" }) });

    expect(res.status).toBe(400);
    expect((await repo().getLead("lead-1"))?.contact).toMatchObject({
      source: "crm",
      sourceLabel: "Follow Up Boss",
      providerRefs: { followupboss: "person-123" },
    });
  });

  it("requires a documented basis before a channel is marked allowed", async () => {
    await seedLead();
    const res = await PATCH(patch("lead-1", {
      email: "known@example.test",
      emailPermission: "allowed",
    }), { params: Promise.resolve({ id: "lead-1" }) });

    expect(res.status).toBe(400);
    expect((await repo().getLead("lead-1"))?.contact).toBeUndefined();
  });
});
