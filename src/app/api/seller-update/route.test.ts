import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Agent, LeadSurface, Note } from "@/lib/core/types";
import { nowISO } from "@/lib/core/ids";
import { emptyStore, InMemoryRepository } from "@/lib/db/repository";

const state = vi.hoisted(() => ({
  agentId: "agent-a" as string | null,
  repo: undefined as unknown,
  live: false,
  claude: {
    calls: 0,
    impl: async (_input: unknown) => ({} as unknown),
  },
}));

vi.mock("@/lib/auth/agent", () => ({
  ensureCurrentAgent: async () => state.agentId,
}));

vi.mock("@/lib/db", () => ({
  getRepo: async () => state.repo,
}));

vi.mock("@/lib/core/config", async (orig) => {
  const actual = await orig<typeof import("@/lib/core/config")>();
  return {
    ...actual,
    claudeLive: () => state.live,
    config: { ...actual.config, claudeModel: "claude-test" },
  };
});

vi.mock("@/lib/agents/claude", () => ({
  claudeJSON: (input: unknown) => {
    state.claude.calls += 1;
    return state.claude.impl(input);
  },
  ClaudeError: class ClaudeError extends Error {},
}));

import { GET, POST } from "./route";

const agent: Agent = {
  id: "agent-a",
  name: "Sam Rivera",
  email: "sam@example.com",
  signatureHtml: "<p>Sam</p>",
  brandVoice: "warm_local",
  locale: "en-US",
  mode: "crm",
};

const otherAgent: Agent = {
  ...agent,
  id: "agent-b",
  email: "other@example.com",
};

function repo(): InMemoryRepository {
  return state.repo as InMemoryRepository;
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/seller-update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(listingId: string) {
  return new NextRequest(`http://localhost/api/seller-update?listingId=${encodeURIComponent(listingId)}`);
}

function lead(overrides: Partial<LeadSurface> = {}): LeadSurface {
  return {
    id: "listing-1",
    agent_id: "agent-a",
    lng: -73.1,
    lat: 40.1,
    address: "12 Oak St",
    h3_index: "h3",
    status: "appointment",
    contact: { name: "Pat Seller", email: "pat@example.com" },
    first_seen_at: nowISO(),
    last_worked_at: nowISO(),
    ...overrides,
  };
}

function note(id: string, body: string, daysAgo = 1): Note {
  return {
    id,
    agent_id: "agent-a",
    lead_surface_id: "listing-1",
    body,
    modality: "text",
    created_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
  };
}

async function seedListing(overrides: Partial<LeadSurface> = {}) {
  await repo().upsertAgent(agent);
  await repo().upsertAgent(otherAgent);
  await repo().upsertLead(lead(overrides));
}

async function seedNotes(notes: Note[]) {
  for (const entry of notes) {
    await repo().addNote(entry);
  }
}

describe("POST /api/seller-update", () => {
  beforeEach(() => {
    state.agentId = "agent-a";
    state.repo = new InMemoryRepository(emptyStore());
    state.live = false;
    state.claude.calls = 0;
    state.claude.impl = async () => ({});
  });

  it("rejects unauthenticated callers", async () => {
    state.agentId = null;
    const res = await POST(post({ listingId: "listing-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 for a listing owned by another tenant", async () => {
    await seedListing({ agent_id: "agent-b" });
    const res = await POST(post({ listingId: "listing-1" }));
    expect(res.status).toBe(404);
  });

  it("rejects buyer-side/non-listing statuses", async () => {
    await seedListing({ status: "new" });
    const res = await POST(post({ listingId: "listing-1" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "listing required" });
  });

  it("returns noUpdate without writing an artifact when no themes survive", async () => {
    await seedListing();
    const res = await POST(post({ listingId: "listing-1" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ noUpdate: true, reason: "no in-window feedback" });
    expect(await repo().listArtifacts("agent-a")).toHaveLength(0);
  });

  it("persists a grounded seller-update artifact and returns themes", async () => {
    await seedListing();
    await seedNotes([
      note("n1", "Buyer said the price felt high and the kitchen looked dated."),
      note("n2", "Second showing thought price seemed too high."),
      note("n3", "They liked it but said the kitchen felt dated."),
    ]);

    const res = await POST(post({ listingId: "listing-1", windowDays: 14 }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.themes.map((theme: { kind: string }) => theme.kind)).toEqual(["volume", "price", "condition"]);
    expect(body.artifact.status).toBe("drafted");
    expect(body.artifact.payload.subject).toContain("Update on showings for 12 Oak St");
    expect(body.artifact.evidence_used[0].sources[0].url).toMatch(/^note:\/\//);

    const artifacts = await repo().listArtifacts("agent-a");
    expect(artifacts).toHaveLength(1);
    expect(await repo().getTrace(body.traceId)).toMatchObject({
      artifact_id: body.artifactId,
      situation: "seller_update",
    });
  });

  it("persists compliance-blocked live output instead of silently dropping it", async () => {
    state.live = true;
    state.claude.impl = async () => ({
      subject: "Showing feedback for 12 Oak St",
      body: "Hi Pat, this home is perfect for families. Warmly, Sam",
    });
    await seedListing();
    await seedNotes([
      note("n1", "Price felt high."),
      note("n2", "Price seemed too high."),
    ]);

    const res = await POST(post({ listingId: "listing-1" }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.artifact.status).toBe("blocked");
    expect(body.artifact.compliance_result.flags[0].category).toBe("familial_status");
  });

  it("returns the latest seller-update artifact for the listing", async () => {
    await seedListing();
    await seedNotes([
      note("n1", "Price felt high."),
      note("n2", "Price seemed too high."),
    ]);
    const created = await POST(post({ listingId: "listing-1" }));
    const createdBody = await created.json();

    const res = await GET(get("listing-1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.artifact.id).toBe(createdBody.artifactId);
  });
});
