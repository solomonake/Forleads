import { describe, it, expect } from "vitest";
import { overallGrade, betterGrade, worseGrade, upgradeOnAgreement } from "./grade";
import type { EvidenceCard } from "@/lib/core/types";

const card = (claim: string, confidence: EvidenceCard["confidence"]): EvidenceCard => ({
  scout: "property",
  claim,
  value: confidence === "D" ? null : "x",
  sources: confidence === "D" ? [] : [{ name: "OSM" }],
  confidence,
  reasoning: confidence === "D" ? "no source" : undefined,
});

describe("grading helpers", () => {
  it("betterGrade / worseGrade order correctly", () => {
    expect(betterGrade("A", "C")).toBe("A");
    expect(worseGrade("A", "C")).toBe("C");
  });

  it("upgradeOnAgreement bumps one notch, capped at A", () => {
    expect(upgradeOnAgreement("B")).toBe("A");
    expect(upgradeOnAgreement("A")).toBe("A");
  });

  it("a pure no-data D gap does NOT tank the headline grade", () => {
    const cards = [
      card("Year built", "A"),
      card("Building footprint", "B"),
      card("Street imagery", "A"),
      card("Flood risk", "B"),
      card("Resale estimate", "D"), // no market provider — honest gap
    ];
    expect(overallGrade(cards)).not.toBe("D");
    expect(["A", "B"]).toContain(overallGrade(cards));
  });

  it("a grounded-but-weak (C) money claim caps the headline at C", () => {
    const cards = [card("Year built", "A"), card("Resale comp estimate", "C")];
    expect(overallGrade(cards)).toBe("C");
  });

  it("returns D only when nothing is grounded", () => {
    expect(overallGrade([card("Resale estimate", "D")])).toBe("D");
    expect(overallGrade([])).toBe("D");
  });
});
