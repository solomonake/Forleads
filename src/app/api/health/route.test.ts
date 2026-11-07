import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getRepo: async () => ({ listLeads: async () => [] }),
}));

vi.mock("@/lib/db/supabase-health", () => ({
  assertSupabaseSchema: async () => {
    throw new Error("required schema unavailable: memory.h3_index does not exist");
  },
}));

import { GET } from "./route";

function getReq() {
  return new Request("http://localhost/api/health", { method: "GET" }) as unknown as Parameters<typeof GET>[0];
}

describe("/api/health 503 shape", () => {
  it("503s with Retry-After: 30 when the schema gate fails", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("keeps the old keys and adds capabilities and degraded (G10)", async () => {
    const body = await (await GET(getReq())).json();
    expect(body).toMatchObject({ ok: false, error: "persistence unavailable" });
    expect(Object.keys(body.modes).sort()).toEqual(["agent", "geocoder", "imagery", "persistence", "property"]);
    expect(body.productionPolicy).toHaveProperty("mockConnectorWritesAllowed");
    expect(body.productionPolicy).toHaveProperty("liveModeViolations");
    expect(body.capabilities.agent).toHaveProperty("status");
    expect(body.capabilities.agent).toHaveProperty("keyConfigured");
    expect(Array.isArray(body.degraded)).toBe(true);
  });
});

describe("/api/health capability truth (G10)", () => {
  it("does not say agent 'live' when live mode is requested without a key", async () => {
    const before = { mode: process.env.FORLEADS_AGENT_MODE, key: process.env.ANTHROPIC_API_KEY };
    process.env.FORLEADS_AGENT_MODE = "live";
    delete process.env.ANTHROPIC_API_KEY;
    vi.resetModules();
    try {
      const { GET: freshGET } = await import("./route");
      const body = await (await freshGET(getReq())).json();
      expect(body.modes.agent).toBe("configured_no_key");
      expect(body.capabilities.agent).toMatchObject({ requested: "live", status: "configured_no_key" });
      expect(body.degraded).toContain("agent");
    } finally {
      if (before.mode === undefined) delete process.env.FORLEADS_AGENT_MODE;
      else process.env.FORLEADS_AGENT_MODE = before.mode;
      if (before.key !== undefined) process.env.ANTHROPIC_API_KEY = before.key;
      vi.resetModules();
    }
  });
});
