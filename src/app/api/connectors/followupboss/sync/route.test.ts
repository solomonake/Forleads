import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  agentId: "agent-a" as string | null,
  sync: vi.fn(),
}));

vi.mock("@/lib/auth/agent", () => ({ requireAgentId: async () => state.agentId }));
vi.mock("@/lib/connectors/followupboss-overlay", () => ({
  syncFollowUpBossOverlay: state.sync,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/connectors/followupboss/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/connectors/followupboss/sync", () => {
  beforeEach(() => {
    state.agentId = "agent-a";
    state.sync.mockReset().mockResolvedValue({
      fetched: 2,
      matched: 1,
      updated: 1,
      unmatched: 1,
      ambiguous: 0,
      duplicateIds: 0,
      complete: true,
    });
  });

  it("scopes a complete snapshot sync to the authenticated agent", async () => {
    const res = await POST(request({}));
    expect(res.status).toBe(200);
    expect(state.sync).toHaveBeenCalledWith("agent-a");
  });

  it("rejects unauthenticated and oversized-cursor requests before provider reads", async () => {
    state.agentId = null;
    expect((await POST(request({}))).status).toBe(401);
    state.agentId = "agent-a";
    expect((await POST(request({ cursor: "page-6" }))).status).toBe(400);
    expect(state.sync).not.toHaveBeenCalled();
  });
});
