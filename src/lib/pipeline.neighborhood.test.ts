// ============================================================================
// pipeline.neighborhood.test.ts — H3-cell neighborhood priors v1.
//
// Two leads in the same H3 cell: the SECOND tap surfaces non-zero
// neighborhoodPriors derived from the first lead's grounded evidence. Two
// leads in DIFFERENT cells stay isolated (no cross-cell leakage). Priors are
// agent-scoped — a different agent's leads in the same cell must not surface.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { ensureLead, runSwarm } from "@/lib/pipeline";
import {
  persistNeighborhoodMemory,
  recallNeighborhood,
} from "@/lib/agents/memory";
import { DEMO_AGENT_ID } from "@/lib/core/config";

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
});

describe("H3 neighborhood priors", () => {
  it("a second lead in the same area cell sees grounded market priors", async () => {
    // Two addresses, same lng/lat (same H3 cell at any resolution).
    const lngLat = { lng: -73.9851, lat: 40.7484 };
    const leadA = await ensureLead(DEMO_AGENT_ID, { address: "100 Block St", ...lngLat });
    await persistNeighborhoodMemory(DEMO_AGENT_ID, leadA, {
      scout: "market",
      claim: "Median days on market",
      value: 24,
      sources: [{ name: "licensed market provider" }],
      confidence: "A",
    });

    const leadB = await ensureLead(DEMO_AGENT_ID, { address: "102 Block St", ...lngLat });
    expect(leadB.h3_index).toBe(leadA.h3_index);
    const swarmB = await runSwarm(leadB);
    // Second lead in the same cell — must see priors from lead A.
    expect(swarmB.summary.neighborhoodPriors).toBeDefined();
    expect(swarmB.summary.neighborhoodPriors!).toBeGreaterThan(0);
    expect(swarmB.summary.neighborhoodNote).toMatch(/area fact.*near this location/);
  });

  it("a lead in a DIFFERENT cell sees no priors from the first cell", async () => {
    await runSwarm(
      await ensureLead(DEMO_AGENT_ID, { address: "200 First Ave", lng: -73.99, lat: 40.75 }),
    );
    // Far enough away that h3 (res 10) will land in a different cell.
    const swarmC = await runSwarm(
      await ensureLead(DEMO_AGENT_ID, { address: "1 Far Way", lng: -118.24, lat: 34.05 }),
    );
    expect(swarmC.summary.neighborhoodPriors).toBeUndefined();
  });

  it("recallNeighborhood is agent-scoped — another agent's leads in the same cell must NOT surface", async () => {
    const lngLat = { lng: -73.97, lat: 40.74 };
    await runSwarm(
      await ensureLead(DEMO_AGENT_ID, { address: "300 Shared Block", ...lngLat }),
    );
    const lead = await ensureLead(DEMO_AGENT_ID, { address: "302 Shared Block", ...lngLat });

    // Same cell, different agent — recallNeighborhood for the OTHER agent
    // must come back empty (RLS analogue).
    const hits = await recallNeighborhood("00000000-0000-0000-0000-00000000ZZZZ", lead.h3_index!);
    expect(hits.length).toBe(0);
  });

  it("keeps parcel, imagery, people, synthetic risk, and grade-D gaps local", async () => {
    const lngLat = { lng: -73.96, lat: 40.78 };
    const lead = await ensureLead(DEMO_AGENT_ID, { address: "400 Safe Block", ...lngLat });

    for (const scout of ["property", "imagery", "people", "risk"] as const) {
      expect(
        await persistNeighborhoodMemory(DEMO_AGENT_ID, lead, {
          scout,
          claim: "Must stay local",
          value: "local only",
          sources: [{ name: "test" }],
          confidence: "A",
        }),
      ).toBeNull();
    }
    expect(
      await persistNeighborhoodMemory(DEMO_AGENT_ID, lead, {
        scout: "market",
        claim: "No provider coverage",
        value: null,
        sources: [],
        confidence: "D",
      }),
    ).toBeNull();
    expect(
      await persistNeighborhoodMemory(DEMO_AGENT_ID, lead, {
        scout: "market",
        claim: "Median days on market",
        value: 24,
        sources: [{ name: "licensed market provider" }],
        confidence: "A",
      }),
    ).not.toBeNull();

    const hits = await recallNeighborhood(DEMO_AGENT_ID, lead.h3_index!);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.memory.text).toMatch(/^\[market\/A\]/);
  });
});
