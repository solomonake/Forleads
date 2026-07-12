import { describe, expect, it } from "vitest";
import { cardFreshness, parseEvidenceDate, sourceFreshness } from "./freshness";
import type { EvidenceCard } from "@/lib/core/types";

const now = new Date("2026-07-12T12:00:00.000Z");

describe("evidence source freshness", () => {
  it("parses YYYY-MM and YYYY-MM-DD evidence dates", () => {
    expect(parseEvidenceDate("2026-07")?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(parseEvidenceDate("2026-07-12")?.toISOString()).toBe("2026-07-12T00:00:00.000Z");
    expect(parseEvidenceDate("07/12/2026")).toBeNull();
  });

  it("labels current, stale, unknown, future, and invalid sources", () => {
    expect(sourceFreshness({ name: "County", as_of: "2026-07-01" }, now).status).toBe("current");
    expect(sourceFreshness({ name: "County", as_of: "2020-01-01" }, now).status).toBe("stale");
    expect(sourceFreshness({ name: "County" }, now).status).toBe("unknown");
    expect(sourceFreshness({ name: "County", as_of: "2027-01-01" }, now).status).toBe("future");
    expect(sourceFreshness({ name: "County", as_of: "last summer" }, now).status).toBe("invalid");
  });

  it("summarizes the riskiest source freshness on a card", () => {
    const card: EvidenceCard = {
      scout: "property",
      claim: "Year built",
      value: "1936",
      confidence: "A",
      sources: [
        { name: "Current assessor", as_of: "2026-06-01" },
        { name: "Older export", as_of: "2020-01-01" },
      ],
    };

    expect(cardFreshness(card, now)).toMatchObject({ status: "stale", asOf: "2020-01-01" });
  });
});
