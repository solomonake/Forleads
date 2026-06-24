import { describe, expect, it, vi } from "vitest";
import { DEMO_AGENT_ID } from "@/lib/core/config";

// Steer getSession without a Next request context.
const session = { value: null as null | { sub: string } };
vi.mock("./session", () => ({
  getSession: () => session.value,
}));

import { agentIdForSub, currentAgentId, readAgentId, requireAgentId } from "./agent";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("agentIdForSub", () => {
  it("is a valid uuid", () => {
    expect(agentIdForSub("google|123")).toMatch(UUID_RE);
  });

  it("is deterministic — same sub → same id, forever", () => {
    expect(agentIdForSub("google|123")).toBe(agentIdForSub("google|123"));
  });

  it("isolates tenants — different subs → different ids", () => {
    expect(agentIdForSub("user-a")).not.toBe(agentIdForSub("user-b"));
  });

  it("never collides with the shared demo workspace", () => {
    expect(agentIdForSub("any-real-user")).not.toBe(DEMO_AGENT_ID);
  });

  it("derives via the strong SHA-256 path (version-8 uuid), not SHA-1", () => {
    // CodeQL flagged SHA-1 (v5) receiving user-derived input; the per-user id
    // must come from deterministicUuid (v8). The version nibble is char 14.
    expect(agentIdForSub("google|123")[14]).toBe("8");
  });
});

describe("currentAgentId / requireAgentId", () => {
  it("is null when unauthenticated (mutating routes must 401)", () => {
    session.value = null;
    expect(currentAgentId()).toBeNull();
    expect(requireAgentId()).toBeNull();
  });

  it("is the per-user id when authenticated, never client-controlled", () => {
    session.value = { sub: "google|abc" };
    expect(currentAgentId()).toBe(agentIdForSub("google|abc"));
  });
});

describe("readAgentId", () => {
  it("falls back to the read-only demo workspace when logged out", () => {
    session.value = null;
    expect(readAgentId()).toBe(DEMO_AGENT_ID);
  });

  it("is the user's own workspace when logged in", () => {
    session.value = { sub: "google|xyz" };
    expect(readAgentId()).toBe(agentIdForSub("google|xyz"));
  });
});
