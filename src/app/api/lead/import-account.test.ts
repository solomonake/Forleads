import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ writes: 0 }));
vi.mock("@/lib/auth/agent", () => ({ ensureCurrentAgent: async () => "agent-A", agentIdForSub: (sub: string) => `agent-${sub}` }));
vi.mock("@/lib/pipeline", () => ({
  ensureLead: async () => { state.writes++; return { id: "lead" }; },
  runSwarm: async (lead: unknown) => ({ lead, summary: {}, rejected: [] }),
  buildDegradedLeadSummary: () => ({}),
}));
vi.mock("@/lib/ratelimit", () => ({ enforceRateLimit: () => null }));
import { POST } from "./route";
function request(sub?: string) {
  return new Request("http://localhost/api/lead", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: "Synthetic", lng: 0, lat: 0, expectedUserSub: sub }) }) as Parameters<typeof POST>[0];
}
describe("import account precondition", () => {
  it("rejects a different account before any lead write", async () => {
    const before = state.writes; const res = await POST(request("B"));
    expect(res.status).toBe(409); expect(await res.json()).toMatchObject({ code: "import_account_changed" }); expect(state.writes).toBe(before);
  });
  it("accepts the matching account and preserves normal non-import callers", async () => {
    expect((await POST(request("A"))).status).toBe(200);
    expect((await POST(request())).status).toBe(200);
  });
});
