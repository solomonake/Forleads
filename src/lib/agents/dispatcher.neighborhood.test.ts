// ============================================================================
// dispatcher.neighborhood.test.ts — dispatcher v2 honors neighborhood priors.
//
// When `neighborhoodCoveredScouts` includes a kind, the dispatcher drops that
// scout job and emits a "Skipping … covered by a sibling lead on this block"
// note. The lead-scoped property recall still wins independently.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { planDispatch } from "./dispatcher";

beforeEach(() => {
  delete process.env.OLLAMA_URL;
});

describe("planDispatch × neighborhoodCoveredScouts", () => {
  it("drops the risk scout when risk is covered by a sibling lead", async () => {
    const fresh = await planDispatch({
      lng: -73.99,
      lat: 40.75,
      address: "1 A",
      status: "researching",
    });
    expect(fresh.scouts.map((s) => s.type)).toContain("risk");

    const covered = await planDispatch({
      lng: -73.99,
      lat: 40.75,
      address: "1 A",
      status: "researching",
      neighborhoodCoveredScouts: ["risk"],
    });
    expect(covered.scouts.map((s) => s.type)).not.toContain("risk");
    expect(covered.notes.some((n) => /Skipping risk scout: covered by a sibling/.test(n))).toBe(true);
  });

  it("drops imagery + market simultaneously when both are covered", async () => {
    const covered = await planDispatch({
      lng: -73.99,
      lat: 40.75,
      address: "1 A",
      status: "researching",
      neighborhoodCoveredScouts: ["imagery", "market"],
    });
    const types = covered.scouts.map((s) => s.type);
    expect(types).not.toContain("imagery");
    expect(types).not.toContain("market");
    expect(types).toContain("risk");
  });

  it("composes with lead-scoped property recall — both can fire on the same call", async () => {
    const covered = await planDispatch({
      lng: -73.99,
      lat: 40.75,
      address: "1 A",
      status: "researching",
      priorGroundedCount: 2,
      neighborhoodCoveredScouts: ["risk"],
    });
    const types = covered.scouts.map((s) => s.type);
    expect(types).not.toContain("property");
    expect(types).not.toContain("risk");
    expect(covered.notes.some((n) => /Skipping property scout: 2 prior/.test(n))).toBe(true);
    expect(covered.notes.some((n) => /Skipping risk scout: covered by a sibling/.test(n))).toBe(true);
  });
});
