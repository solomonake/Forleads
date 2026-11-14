// G5 (audit 2026-11-07): an Agent Trace holds a tenant's notes, drafts and
// reasoning. Holding a trace or artifact id must not be enough to read another
// tenant's trace: the route scopes to the caller's own workspace and answers
// 404 (not 403) so ids can't be probed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyStore, InMemoryRepository } from "@/lib/db/repository";
import { agentIdForSub } from "@/lib/auth/agent";
import { DEMO_AGENT_ID } from "@/lib/core/config";
import type { AgentTrace } from "@/lib/core/types";

const state = vi.hoisted(() => ({
  repo: undefined as unknown,
  session: null as null | { sub: string; name: string; email: string },
}));

vi.mock("@/lib/db", () => ({ getRepo: async () => state.repo }));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => state.session,
  seal: (x: unknown) => JSON.stringify(x),
  unseal: () => null,
  SESSION_COOKIE: "fl_session",
  sessionCookieOptions: () => ({}),
}));

import { GET } from "./route";

const TENANT_A = agentIdForSub("google-sub-a");

function trace(id: string, agentId: string, artifactId: string): AgentTrace {
  return {
    id,
    agent_id: agentId,
    artifact_id: artifactId,
    trigger: "note",
    situation: "private situation",
    evidenceUsed: [],
    excluded: [{ content: "private note text", reason: "test" }],
    policy: [],
    cost: { claudeCalls: 0, paidDataCalls: 0, ms: 1 },
    created_at: new Date(0).toISOString(),
  };
}

function signIn(sub: string | null) {
  state.session = sub ? { sub, name: sub, email: `${sub}@example.com` } : null;
}

async function get(id: string) {
  const req = new Request(`http://localhost/api/trace/${id}`) as unknown as Parameters<typeof GET>[0];
  return GET(req, { params: Promise.resolve({ id }) });
}

describe("GET /api/trace/[id] tenant scoping", () => {
  beforeEach(async () => {
    const repo = new InMemoryRepository(emptyStore());
    await repo.saveTrace(trace("trace-a", TENANT_A, "artifact-a"));
    await repo.saveTrace(trace("trace-demo", DEMO_AGENT_ID, "artifact-demo"));
    state.repo = repo;
  });

  it("tenant B gets a 404 for tenant A's trace id", async () => {
    signIn("google-sub-b");
    const res = await get("trace-a");
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("private");
  });

  it("tenant B gets a 404 for tenant A's artifact id", async () => {
    signIn("google-sub-b");
    expect((await get("artifact-a")).status).toBe(404);
  });

  it("a signed-out caller can't read tenant A's trace", async () => {
    signIn(null);
    expect((await get("trace-a")).status).toBe(404);
    expect((await get("artifact-a")).status).toBe(404);
  });

  it("tenant A still reads its own trace by trace id and by artifact id", async () => {
    signIn("google-sub-a");
    const byTrace = await get("trace-a");
    expect(byTrace.status).toBe(200);
    expect(((await byTrace.json()) as { trace: AgentTrace }).trace.id).toBe("trace-a");
    expect((await get("artifact-a")).status).toBe(200);
  });

  it("signed out falls back to the public demo workspace, like the other read routes", async () => {
    signIn(null);
    expect((await get("trace-demo")).status).toBe(200);
  });
});
