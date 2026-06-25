import { describe, expect, it } from "vitest";
import { buildDegradedLeadSummary } from "./pipeline";

describe("degraded lead summary", () => {
  it("returns an honest D-grade fallback when scouts degrade", () => {
    const summary = buildDegradedLeadSummary(
      { address: "22125 Clarksburg Rd, Maryland", locality: "Maryland, USA" },
      "Scout timeout"
    );

    expect(summary.grade).toBe("D");
    expect(summary.cards).toHaveLength(2);
    expect(summary.cards[0]?.confidence).toBe("B");
    expect(summary.cards[1]?.confidence).toBe("D");
    expect(summary.breakout?.kind).toBe("ask_human");
    expect(summary.gaps[0]).toContain("Scout timeout");
  });
});
