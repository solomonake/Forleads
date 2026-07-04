import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { emptyStore, InMemoryRepository } from "@/lib/db/repository";
import { unsealValue } from "@/lib/auth/session";

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

import { PUT, DELETE } from "./route";

function repo(): InMemoryRepository {
  return state.repo as InMemoryRepository;
}

function put(provider: string, body: unknown) {
  return new NextRequest(`http://localhost/api/connectors/${provider}/credential`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function del(provider: string) {
  return new NextRequest(`http://localhost/api/connectors/${provider}/credential`, {
    method: "DELETE",
  });
}

describe("PUT /api/connectors/[provider]/credential", () => {
  beforeEach(() => {
    state.agentId = "agent-a";
    state.repo = new InMemoryRepository(emptyStore());
  });

  it("rejects unauthenticated callers", async () => {
    state.agentId = null;
    const res = await PUT(put("followupboss", { apiKey: "fka_test" }), {
      params: Promise.resolve({ provider: "followupboss" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects an unsupported provider (no paste-in schema)", async () => {
    const res = await PUT(put("google", { apiKey: "x" }), {
      params: Promise.resolve({ provider: "google" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a missing required field with 400 and a clear message", async () => {
    const res = await PUT(put("gohighlevel", { apiKey: "ghl_key" }), {
      params: Promise.resolve({ provider: "gohighlevel" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Location ID/);
  });

  it("persists an FUB credential encrypted and returns connected:true", async () => {
    const res = await PUT(put("followupboss", { apiKey: "fka_test_key" }), {
      params: Promise.resolve({ provider: "followupboss" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; connected: boolean };
    expect(body.connected).toBe(true);
    // The row is present and the payload is NOT stored as plaintext.
    const row = await repo().findConnectorCredential("agent-a", "followupboss");
    expect(row).toBeTruthy();
    expect(row!.encrypted_payload).not.toContain("fka_test_key");
    // Decrypts back to the same payload.
    const decoded = unsealValue<{ apiKey: string }>(row!.encrypted_payload);
    expect(decoded?.apiKey).toBe("fka_test_key");
  });

  it("saving twice revokes the prior row and bumps version", async () => {
    await PUT(put("followupboss", { apiKey: "first_key" }), {
      params: Promise.resolve({ provider: "followupboss" }),
    });
    await PUT(put("followupboss", { apiKey: "second_key" }), {
      params: Promise.resolve({ provider: "followupboss" }),
    });
    const live = await repo().findConnectorCredential("agent-a", "followupboss");
    expect(live).toBeTruthy();
    expect(live!.version).toBe(2);
    const decoded = unsealValue<{ apiKey: string }>(live!.encrypted_payload);
    expect(decoded?.apiKey).toBe("second_key");
  });

  it("is tenant-scoped: agent A's cred is invisible to agent B", async () => {
    state.agentId = "agent-a";
    await PUT(put("followupboss", { apiKey: "a_key" }), {
      params: Promise.resolve({ provider: "followupboss" }),
    });
    state.agentId = "agent-b";
    const bRow = await repo().findConnectorCredential("agent-b", "followupboss");
    expect(bRow).toBeNull();
    // A can still see A's row.
    const aRow = await repo().findConnectorCredential("agent-a", "followupboss");
    expect(aRow).toBeTruthy();
  });
});

describe("DELETE /api/connectors/[provider]/credential", () => {
  beforeEach(() => {
    state.agentId = "agent-a";
    state.repo = new InMemoryRepository(emptyStore());
  });

  it("revokes the live row and reports connected:false", async () => {
    await PUT(put("followupboss", { apiKey: "to_delete" }), {
      params: Promise.resolve({ provider: "followupboss" }),
    });
    const res = await DELETE(del("followupboss"), {
      params: Promise.resolve({ provider: "followupboss" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { connected: boolean; revoked: boolean };
    expect(body.connected).toBe(false);
    expect(body.revoked).toBe(true);
    const row = await repo().findConnectorCredential("agent-a", "followupboss");
    expect(row).toBeNull();
  });

  it("is idempotent when nothing exists (returns revoked:false)", async () => {
    const res = await DELETE(del("followupboss"), {
      params: Promise.resolve({ provider: "followupboss" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { revoked: boolean };
    expect(body.revoked).toBe(false);
  });
});
