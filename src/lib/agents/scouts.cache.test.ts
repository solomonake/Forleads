import { beforeEach, describe, expect, it } from "vitest";
import type { ScoutInput } from "./scouts";
import { runScoutCached } from "./scouts";
import type { ScoutType } from "@/lib/core/types";

// Reset the process-wide cache singleton between cases.
beforeEach(() => {
  (globalThis as unknown as { __forleadsCache?: unknown }).__forleadsCache = undefined;
});

const input = (
  type: ScoutType,
  address = "1 Test St",
  coords = { lng: -73.985, lat: 40.748 },
): ScoutInput => ({
  lng: coords.lng,
  lat: coords.lat,
  address,
  job: {
    type,
    budget: { maxCalls: 3, maxMs: 1500, maxTokens: 0 },
    why: "test",
    allowlist:
      type === "property"
        ? ["OpenStreetMap", "OSM"]
        : type === "imagery"
          ? ["Mapillary", "Esri", "Imagery Scout"]
          : type === "risk"
            ? ["FEMA", "NFHL"]
            : [],
  },
});

describe("runScoutCached", () => {
  it("serves a repeat property lookup from cache without another provider call", async () => {
    const first = await runScoutCached(input("property"));
    const second = await runScoutCached(input("property"));
    expect(first.status).toBe("ok"); // mock provider grounds the cell → cacheable
    expect(second.cost.cacheHit).toBe(true);
    expect(second.cost.calls).toBe(0);
  });

  it("does not cache honest insufficient-evidence risk gaps", async () => {
    const a = await runScoutCached(input("risk", "10 A St"));
    const b = await runScoutCached(input("risk", "12 B St")); // different address, same coords/cell
    expect(a.status).toBe("insufficient_evidence");
    expect(b.cost.cacheHit).not.toBe(true);
  });

  it("serves a repeat successful risk lookup from cache at H3-cell scope", async () => {
    const coords = { lng: -95.3979, lat: 29.7858 };
    const first = await runScoutCached(input("risk", "Houston Heights", coords));
    const second = await runScoutCached(input("risk", "Nearby Houston parcel", coords));
    expect(first.status).toBe("ok");
    expect(second.cost.cacheHit).toBe(true);
    expect(second.cost.calls).toBe(0);
  });

  it("NEVER caches the people scout (personal signals must not leak across leads)", async () => {
    const a = await runScoutCached(input("people"));
    const b = await runScoutCached(input("people"));
    expect(b).not.toBe(a); // fresh result each time
  });
});
