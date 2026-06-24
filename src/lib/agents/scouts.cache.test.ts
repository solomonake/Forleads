import { beforeEach, describe, expect, it } from "vitest";
import type { ScoutInput } from "./scouts";
import { runScoutCached } from "./scouts";
import type { ScoutType } from "@/lib/core/types";

// Reset the process-wide cache singleton between cases.
beforeEach(() => {
  (globalThis as unknown as { __forleadsCache?: unknown }).__forleadsCache = undefined;
});

const input = (type: ScoutType, address = "1 Test St"): ScoutInput => ({
  lng: -73.985,
  lat: 40.748,
  address,
  job: { type, budget: { maxCalls: 1, maxMs: 1500, maxTokens: 0 }, why: "test", allowlist: [] },
});

describe("runScoutCached", () => {
  it("serves a repeat property lookup from cache (same address → same result object)", async () => {
    const first = await runScoutCached(input("property"));
    const second = await runScoutCached(input("property"));
    expect(first.status).toBe("ok"); // mock provider grounds the cell → cacheable
    expect(second).toBe(first); // identical reference = served from cache, no re-scout
  });

  it("caches area-level risk by H3 cell (shared across addresses in the cell)", async () => {
    const a = await runScoutCached(input("risk", "10 A St"));
    const b = await runScoutCached(input("risk", "12 B St")); // different address, same coords/cell
    expect(b).toBe(a);
  });

  it("NEVER caches the people scout (personal signals must not leak across leads)", async () => {
    const a = await runScoutCached(input("people"));
    const b = await runScoutCached(input("people"));
    expect(b).not.toBe(a); // fresh result each time
  });
});
