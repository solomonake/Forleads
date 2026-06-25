// Regression: if any scout throws (provider down, network blip, etc.) the
// swarm must NOT 500. The failed scout becomes status="error" with the
// message captured in gaps; surviving scouts' cards still flow through.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureLead, runSwarm } from "./pipeline";
import { DEMO_AGENT_ID } from "./core/config";
import * as scouts from "./agents/scouts";

interface RepoGlobal {
  __forleadsRepo?: unknown;
  __forleadsSeeded?: unknown;
  __forleadsCache?: unknown;
}

const g = globalThis as unknown as RepoGlobal;

beforeEach(() => {
  g.__forleadsRepo = undefined;
  g.__forleadsSeeded = undefined;
  g.__forleadsCache = undefined;
  delete process.env.OLLAMA_URL;
  vi.restoreAllMocks();
});

describe("runSwarm degrades gracefully when a scout throws", () => {
  it("a thrown scout becomes status='error' and surviving scouts still produce cards", async () => {
    // Capture the real impl so we can return it for non-target scouts.
    const realRun = scouts.runScoutCached;
    vi.spyOn(scouts, "runScoutCached").mockImplementation(async (input) => {
      if (input.job.type === "property") {
        throw new Error("simulated: property provider 500");
      }
      return realRun(input);
    });

    const lead = await ensureLead(DEMO_AGENT_ID, {
      address: "1 Scout-Fail St",
      lng: -73.99,
      lat: 40.75,
    });

    const swarm = await runSwarm(lead);

    // The swarm completed at all (didn't throw).
    expect(swarm.scoutResults.length).toBeGreaterThan(0);

    // Property scout appears as a status="error" entry, NOT missing.
    const property = swarm.scoutResults.find((r) => r.scout === "property");
    expect(property).toBeDefined();
    expect(property!.status).toBe("error");
    expect(property!.gaps.some((g) => g.includes("scout failed"))).toBe(true);

    // At least one non-property scout produced a real result.
    const nonProperty = swarm.scoutResults.filter((r) => r.scout !== "property");
    expect(nonProperty.length).toBeGreaterThan(0);
  });
});
