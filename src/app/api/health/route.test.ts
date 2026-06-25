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
});
