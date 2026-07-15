import { afterEach, describe, expect, it, vi } from "vitest";

interface RepoGlobal {
  __forleadsRepo?: unknown;
  __forleadsSeeded?: unknown;
}

describe("repository runtime selection", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/core/config");
    vi.resetModules();
    const global = globalThis as unknown as RepoGlobal;
    delete global.__forleadsRepo;
    delete global.__forleadsSeeded;
  });

  it("fails closed when Supabase is selected without server credentials", async () => {
    vi.resetModules();
    vi.doMock("@/lib/core/config", () => ({
      DEMO_AGENT_ID: "00000000-0000-0000-0000-000000000001",
      config: {
        persist: "supabase",
        supabase: { url: undefined, serviceKey: undefined },
      },
    }));
    const global = globalThis as unknown as RepoGlobal;
    delete global.__forleadsRepo;
    delete global.__forleadsSeeded;
    const { getRepo } = await import("./index");
    await expect(getRepo()).rejects.toThrow(/requires NEXT_PUBLIC_SUPABASE_URL/);
  });
});
