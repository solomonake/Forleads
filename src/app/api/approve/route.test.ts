import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/agent", () => ({
  ensureCurrentAgent: async () => "00000000-0000-0000-0000-000000000001",
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => null,
  seal: (x: unknown) => JSON.stringify(x),
  SESSION_COOKIE: "fl_session",
  sessionCookieOptions: () => ({}),
}));

vi.mock("@/lib/auth/google", () => ({
  freshAccessToken: async (tokens: unknown) => tokens,
}));

vi.mock("@/lib/auth/credentials", () => ({
  loadGoogleCredential: async () => null,
  saveGoogleCredential: async () => "credential-1",
}));

vi.mock("@/lib/pipeline", () => ({
  approveArtifact: async () => {
    throw new Error("Connector write failed: Follow Up Boss is not configured. Add FOLLOWUPBOSS_API_KEY.");
  },
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
  it("surfaces connector setup failures instead of internal error", async () => {
    const res = await POST(post({ artifactId: "artifact-1", expectedRevision: 1 }));
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(424);
    expect(body.error).toContain("Setup required");
    expect(body.error).toContain("FOLLOWUPBOSS_API_KEY");
    expect(body.error).not.toContain("internal error");
  });
});
