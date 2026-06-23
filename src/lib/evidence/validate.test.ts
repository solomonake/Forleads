import { describe, it, expect } from "vitest";
import { validateEvidenceCard, partitionCards } from "./validate";
import type { EvidenceCard } from "@/lib/core/types";

const base: EvidenceCard = {
  scout: "property",
  claim: "Year built",
  value: "~1936",
  sources: [{ name: "OpenStreetMap" }],
  confidence: "A",
};

describe("EvidenceCard contract", () => {
  it("accepts a grounded non-D card", () => {
    expect(validateEvidenceCard(base).valid).toBe(true);
  });

  it("rejects a non-D card with no source (no naked numbers)", () => {
    const card = { ...base, sources: [] };
    const res = validateEvidenceCard(card);
    expect(res.valid).toBe(false);
    expect(res.errors.join(" ")).toMatch(/source/i);
  });

  it("rejects a non-D card with null value", () => {
    const card = { ...base, value: null };
    expect(validateEvidenceCard(card).valid).toBe(false);
  });

  it("requires D cards to have a null value", () => {
    const card: EvidenceCard = {
      scout: "market",
      claim: "Resale estimate",
      value: "$500k",
      sources: [],
      confidence: "D",
      reasoning: "no comps",
    };
    expect(validateEvidenceCard(card).valid).toBe(false);
  });

  it("accepts an honest D gap card", () => {
    const card: EvidenceCard = {
      scout: "market",
      claim: "Resale estimate",
      value: null,
      sources: [],
      confidence: "D",
      reasoning: "No recent comps for this market in the free tier.",
    };
    expect(validateEvidenceCard(card).valid).toBe(true);
  });

  it("requires D cards to explain the gap", () => {
    const card: EvidenceCard = {
      scout: "market",
      claim: "Resale estimate",
      value: null,
      sources: [],
      confidence: "D",
    };
    expect(validateEvidenceCard(card).valid).toBe(false);
  });

  it("partitions valid and rejected cards", () => {
    const bad = { ...base, sources: [], value: 5 } as EvidenceCard;
    const { valid, rejected } = partitionCards([base, bad]);
    expect(valid).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});
