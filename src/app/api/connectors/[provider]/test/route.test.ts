import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { emptyStore, InMemoryRepository } from "@/lib/db/repository";
import { unsealValue } from "@/lib/auth/session";
import type { FollowUpBossCredential } from "@/lib/connectors/followupboss";

const state = vi.hoisted(() => ({
  agentId: "agent-a" as string | null,
  repo: undefined as unknown,
}));

vi.mock("@/lib/auth/agent", () => ({ requireAgentId: async () => state.agentId }));
vi.mock("@/lib/db", () => ({ getRepo: async () => state.repo }));

const prior = {
  systemName: process.env.FOLLOWUPBOSS_SYSTEM_NAME,
  systemKey: process.env.FOLLOWUPBOSS_SYSTEM_KEY,
  baseUrl: process.env.FOLLOWUPBOSS_BASE_URL,
};

function request() {
  return new NextRequest("http://localhost/api/connectors/followupboss/test", { method: "POST" });
}

describe("POST /api/connectors/followupboss/test", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    state.agentId = "agent-a";
    state.repo = new InMemoryRepository(emptyStore());
    process.env.FOLLOWUPBOSS_SYSTEM_NAME = "Forleads";
    process.env.FOLLOWUPBOSS_SYSTEM_KEY = "system-secret";
    process.env.FOLLOWUPBOSS_BASE_URL = "https://api.followupboss.test/v1";
  });

  afterEach(() => {
    if (prior.systemName === undefined) delete process.env.FOLLOWUPBOSS_SYSTEM_NAME;
    else process.env.FOLLOWUPBOSS_SYSTEM_NAME = prior.systemName;
    if (prior.systemKey === undefined) delete process.env.FOLLOWUPBOSS_SYSTEM_KEY;
    else process.env.FOLLOWUPBOSS_SYSTEM_KEY = prior.systemKey;
    if (prior.baseUrl === undefined) delete process.env.FOLLOWUPBOSS_BASE_URL;
    else process.env.FOLLOWUPBOSS_BASE_URL = prior.baseUrl;
  });

  it("binds one exact active user without exposing private identity metadata", async () => {
    const { saveTenantCredential } = await import("@/lib/auth/credentials");
    await saveTenantCredential("agent-a", "followupboss", { apiKey: "fka_tenant" });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        account: { id: 77 },
        user: { email: "agent@example.com", name: "Agent" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        users: [{ id: 42, email: "agent@example.com", name: "Agent" }],
      }), { status: 200 }));
    const { POST } = await import("./route");
    const res = await POST(request(), { params: Promise.resolve({ provider: "followupboss" }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ provider: "followupboss", ok: true, label: "agent@example.com" });
    expect(fetchMock.mock.calls[0]![1]?.headers).toMatchObject({
      "X-System": "Forleads",
      "X-System-Key": "system-secret",
    });
    const row = await (state.repo as InMemoryRepository)
      .findConnectorCredential("agent-a", "followupboss");
    expect(row?.version).toBe(1);
    const credential = unsealValue<FollowUpBossCredential>(row!.encrypted_payload);
    expect(credential).toMatchObject({
      apiKey: "fka_tenant",
      identity: { workspaceId: "77", userId: 42, label: "agent@example.com" },
    });
  });

  it("fails closed when user identity is ambiguous and leaves the key unverified", async () => {
    const { saveTenantCredential } = await import("@/lib/auth/credentials");
    await saveTenantCredential("agent-a", "followupboss", { apiKey: "fka_tenant" });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        account: { id: 77 }, user: { email: "same@example.com" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        users: [
          { id: 1, email: "same@example.com" },
          { id: 2, email: "same@example.com" },
        ],
      }), { status: 200 }));
    const { POST } = await import("./route");
    const res = await POST(request(), { params: Promise.resolve({ provider: "followupboss" }) });
    const body = await res.json() as { ok: boolean; error?: string };
    expect(body).toMatchObject({ ok: false });
    expect(body.error).toMatch(/ambiguous/i);
    const row = await (state.repo as InMemoryRepository)
      .findConnectorCredential("agent-a", "followupboss");
    expect(unsealValue<FollowUpBossCredential>(row!.encrypted_payload)?.identity).toBeUndefined();
  });
});
