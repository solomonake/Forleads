import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_AGENT_ID } from "@/lib/core/config";

// Steer getSession without a Next request context.
const session = { value: null as null | { sub: string; name?: string; email?: string } };
vi.mock("./session", () => ({
  getSession: () => session.value,
}));

import {
  agentIdForSub,
  currentAgentId,
  ensureCurrentAgent,
  readAgentId,
  readAgentIdEnsured,
  requireAgentId,
} from "./agent";
import { getRepo } from "@/lib/db";

interface RepoGlobal {
  __forleadsRepo?: unknown;
  __forleadsSeeded?: unknown;
}
const g = globalThis as unknown as RepoGlobal;

beforeEach(() => {
  g.__forleadsRepo = undefined;
  g.__forleadsSeeded = undefined;
});

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

// Production fix (2026-06-24): JIT-provision the agent row from session data
// so writes never FK-violate after a Supabase reset / fresh deploy.
describe("ensureCurrentAgent", () => {
  it("returns null when unauthenticated (no row created)", async () => {
    session.value = null;
    const id = await ensureCurrentAgent();
    expect(id).toBeNull();
  });

  it("creates the agent row on first call for a new session", async () => {
    session.value = { sub: "google|new", name: "New User", email: "new@example.com" };
    const repo = await getRepo();
    const id = agentIdForSub("google|new");
    expect(await repo.getAgent(id)).toBeNull();

    const returned = await ensureCurrentAgent();
    expect(returned).toBe(id);

    const row = await repo.getAgent(id);
    expect(row).not.toBeNull();
    expect(row?.name).toBe("New User");
    expect(row?.email).toBe("new@example.com");
  });

  it("is idempotent — repeat calls do not create duplicate rows", async () => {
    session.value = { sub: "google|repeat", name: "R", email: "r@example.com" };
    const a = await ensureCurrentAgent();
    const b = await ensureCurrentAgent();
    expect(a).toBe(b);
  });
});

describe("readAgentIdEnsured", () => {
  it("falls back to the seeded demo workspace when logged out", async () => {
    session.value = null;
    expect(await readAgentIdEnsured()).toBe(DEMO_AGENT_ID);
  });

  it("ensures the user's row exists before returning the id", async () => {
    session.value = { sub: "google|read", name: "Reader", email: "r@x.com" };
    const repo = await getRepo();
    const id = agentIdForSub("google|read");
    expect(await repo.getAgent(id)).toBeNull();

    const returned = await readAgentIdEnsured();
    expect(returned).toBe(id);
    expect(await repo.getAgent(id)).not.toBeNull();
  });
});
