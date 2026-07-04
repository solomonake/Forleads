import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { emptyStore, InMemoryRepository } from "@/lib/db/repository";
import { unsealValue } from "@/lib/auth/session";

const state = vi.hoisted(() => ({
  agentId: "agent-a" as string | null,
  repo: undefined as unknown,
  exchange: {
    impl: async (_code: string) => ({
      access_token: "ms_access",
      refresh_token: "ms_refresh",
      expiry: Date.now() + 3600_000,
      scope: "Mail.ReadWrite Calendars.ReadWrite offline_access openid email profile",
    }),
  },
  profile: {
    impl: async (_token: string) => ({
      sub: "ms-sub-1",
      name: "Owner Person",
      email: "owner@example.microsoft",
    }),
  },
}));

vi.mock("@/lib/auth/agent", () => ({
  requireAgentId: async () => state.agentId,
}));

vi.mock("@/lib/db", () => ({
  getRepo: async () => state.repo,
}));

vi.mock("@/lib/auth/microsoft", () => ({
  exchangeCode: (code: string) => state.exchange.impl(code),
  fetchProfile: (token: string) => state.profile.impl(token),
}));

import { GET } from "./route";

function callback(code: string | null, callbackState: string | null, cookieState?: string) {
  const url = new URL("http://localhost/api/auth/microsoft/callback");
  if (code !== null) url.searchParams.set("code", code);
  if (callbackState !== null) url.searchParams.set("state", callbackState);
  return new NextRequest(url, {
    method: "GET",
    headers: cookieState ? { cookie: `fl_ms_oauth_state=${cookieState}` } : undefined,
  });
}

function repo(): InMemoryRepository {
  return state.repo as InMemoryRepository;
}

describe("GET /api/auth/microsoft/callback", () => {
  beforeEach(() => {
    state.agentId = "agent-a";
    state.repo = new InMemoryRepository(emptyStore());
  });

  it("redirects with bad_state when the state cookie does not match", async () => {
    const res = await GET(callback("code_x", "state_a", "state_b"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/status=bad_state/);
  });

  it("redirects to login_required when no agent is signed in", async () => {
    state.agentId = null;
    const res = await GET(callback("code_x", "state_a", "state_a"));
    expect(res.headers.get("location")).toMatch(/status=login_required/);
  });

  it("exchanges the code, saves the credential, and redirects to /?connect=microsoft&status=ok", async () => {
    const res = await GET(callback("code_x", "state_a", "state_a"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("status=ok");
    expect(location).toContain("as=owner%40example.microsoft");

    const row = await repo().findConnectorCredential("agent-a", "microsoft");
    expect(row).toBeTruthy();
    const decoded = unsealValue<{ access_token: string; profile: { email: string } }>(
      row!.encrypted_payload,
    );
    expect(decoded?.access_token).toBe("ms_access");
    expect(decoded?.profile.email).toBe("owner@example.microsoft");
  });

  it("propagates OAuth error param through the redirect", async () => {
    const url = new URL("http://localhost/api/auth/microsoft/callback?error=access_denied");
    const req = new NextRequest(url, { method: "GET" });
    const res = await GET(req);
    expect(res.headers.get("location")).toMatch(/status=error&reason=access_denied/);
  });

  it("returns a graceful error redirect if the token exchange throws", async () => {
    state.exchange.impl = async () => {
      throw new Error("boom");
    };
    const res = await GET(callback("code_x", "state_a", "state_a"));
    expect(res.headers.get("location")).toMatch(/status=error&reason=boom/);
  });
});
