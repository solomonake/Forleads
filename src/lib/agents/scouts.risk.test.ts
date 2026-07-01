import { describe, expect, it } from "vitest";
import { runScout } from "./scouts";
import type { ScoutInput } from "./scouts";

const riskInput = (allowlist: string[]): ScoutInput => ({
  lng: -95.3979,
  lat: 29.7858,
  address: "Houston Heights, Houston, TX",
  job: {
    type: "risk",
    budget: { maxCalls: 1, maxMs: 1500, maxTokens: 0 },
    why: "test",
    allowlist,
  },
});

describe("risk scout", () => {
  it("returns ok with a cited FEMA flood-zone card from the mock provider", async () => {
    const result = await runScout(riskInput(["FEMA", "NFHL"]));

    expect(result.status).toBe("ok");
    expect(result.cost.calls).toBe(1);
    expect(result.cards).toMatchObject([
      {
        scout: "risk",
        claim: "Flood zone",
        value: "AE — high-risk SFHA",
        sources: [{ name: "FEMA NFHL" }],
        confidence: "A",
      },
    ]);
  });

  it("honors the scout source allowlist for grounded FEMA cards", async () => {
    const result = await runScout(riskInput(["OpenStreetMap"]));

    expect(result.status).toBe("insufficient_evidence");
    expect(result.cards).toEqual([]);
    expect(result.gaps).toContain("1 card(s) rejected: source outside scout allowlist");
  });
});
