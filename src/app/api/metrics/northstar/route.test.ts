import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { nowISO, uuid } from "@/lib/core/ids";
import type { Agent } from "@/lib/core/types";
import { emptyStore, InMemoryRepository } from "@/lib/db/repository";

const state = vi.hoisted(() => ({
  repo: null as InMemoryRepository | null,
  session: null as { sub: string; email: string } | null,
}));

vi.mock("@/lib/db", () => ({
  getRepo: async () => state.repo,
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => state.session,
}));

import { GET } from "./route";

const founder: Agent = {
  id: "agent-founder",
  name: "Founder",
  email: "solomonriting@gmail.com",
  signatureHtml: "<p>Founder</p>",
  brandVoice: "warm_local",
  locale: "en-US",
  mode: "crm",
};

const teammate: Agent = {
  id: "agent-teammate",
  name: "Teammate",
  email: "agent@example.com",
  signatureHtml: "<p>Teammate</p>",
  brandVoice: "warm_local",
  locale: "en-US",
  mode: "crm",
};

function req() {
  return new NextRequest("http://localhost/api/metrics/northstar", {
    headers: { "x-forwarded-for": "1.1.1.1" },
  });
}

describe("GET /api/metrics/northstar", () => {
  beforeEach(async () => {
    state.repo = new InMemoryRepository(emptyStore());
    state.session = null;
    (globalThis as unknown as { __forleadsRateLimiter?: unknown }).__forleadsRateLimiter = undefined;
    (globalThis as unknown as { __forleadsQuotaGate?: unknown }).__forleadsQuotaGate = undefined;
    await state.repo.upsertAgent(founder);
    await state.repo.upsertAgent(teammate);
  });

  it("rejects non-founder sessions", async () => {
    state.session = { sub: "sub-other", email: "other@example.com" };
    const response = await GET(req());
    expect(response.status).toBe(403);
  });

  it("returns weekly approved-action counts for the founder", async () => {
    state.session = { sub: "sub-founder", email: "solomonriting@gmail.com" };
    await state.repo!.appendEvent({
      id: uuid(),
      agent_id: founder.id,
      type: "northstar.action.approved",
      payload: { artifactId: "artifact-1" },
      source: "test",
      created_at: nowISO(),
    });
    await state.repo!.appendEvent({
      id: uuid(),
      agent_id: founder.id,
      type: "artifact.approved",
      payload: { artifactId: "artifact-2" },
      source: "test",
      created_at: nowISO(),
    });

    const response = await GET(req());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      perAgent: [{ agentId: founder.id, agentName: founder.name, count: 1 }],
    });
  });
});
