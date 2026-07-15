import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: null as null | { google?: unknown; googleCredentialRef?: string },
  approveArtifact: vi.fn(),
  freshAccessToken: vi.fn(async (tokens: unknown) => tokens),
}));

vi.mock("@/lib/auth/agent", () => ({
  ensureCurrentAgent: async () => "00000000-0000-0000-0000-000000000001",
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => mocks.session,
  seal: (x: unknown) => JSON.stringify(x),
  SESSION_COOKIE: "fl_session",
  sessionCookieOptions: () => ({}),
}));

vi.mock("@/lib/auth/google", () => ({
  freshAccessToken: mocks.freshAccessToken,
}));

vi.mock("@/lib/auth/credentials", () => ({
  loadGoogleCredential: async () => null,
  saveGoogleCredential: async () => "credential-1",
}));

vi.mock("@/lib/pipeline", () => ({
  approveArtifact: mocks.approveArtifact,
}));

import { POST } from "./route";

function post(body: unknown) {
  return new Request("http://localhost/api/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
}

describe("POST /api/approve", () => {
  beforeEach(() => {
    mocks.session = null;
    mocks.approveArtifact.mockReset();
    mocks.freshAccessToken.mockReset();
    mocks.freshAccessToken.mockImplementation(async (tokens: unknown) => tokens);
  });

  it("surfaces connector setup failures instead of internal error", async () => {
    mocks.approveArtifact.mockRejectedValue(
      new Error("Connector write failed: Follow Up Boss is not configured. Add a tenant API key after system registration."),
    );

    const res = await POST(post({ artifactId: "artifact-1", expectedRevision: 1 }));
    const body = (await res.json()) as { code: string; error: string };

    expect(res.status).toBe(424);
    expect(body.code).toBe("connector_setup_required");
    expect(body.error).toContain("Setup required");
    expect(body.error).toContain("tenant API key");
    expect(body.error).not.toContain("internal error");
  });

  it("passes stale Google OAuth refresh failures as setup-required connector errors", async () => {
    mocks.session = {
      google: {
        access_token: "old-token",
        refresh_token: "refresh-token",
        expiry: 0,
      },
    };
    mocks.freshAccessToken.mockRejectedValue(new Error("invalid_grant"));
    mocks.approveArtifact.mockImplementation(
      async (_artifactId: string, _revision: number, opts: { googleCredentialError?: string }) => {
      throw new Error(`Connector write failed: ${opts.googleCredentialError}`);
      },
    );

    const res = await POST(post({ artifactId: "artifact-1", expectedRevision: 1 }));
    const body = (await res.json()) as { code: string; error: string };

    expect(res.status).toBe(424);
    expect(body.code).toBe("connector_setup_required");
    expect(body.error).toContain("Google credential needs reconnection");
    expect(body.error).toContain("invalid_grant");
    expect(mocks.approveArtifact.mock.calls[0]?.[2]).toMatchObject({
      agentId: "00000000-0000-0000-0000-000000000001",
      googleAccessToken: undefined,
      googleCredentialError: expect.stringContaining("Google credential needs reconnection"),
    });
  });
});
