import { describe, expect, it } from "vitest";
import { extractFieldSignal, fieldSignalEvidence } from "./field-scout";

describe("field scout evidence", () => {
  it("turns operator observations into cited field evidence", () => {
    const body = "Tall grass and mail piled up. Neighbor says owner moved out. No photo yet.";
    const signal = extractFieldSignal(body);
    const cards = fieldSignalEvidence(body, {
      situation: "interested_seller",
      confidence: 0.82,
      suggested_actions: [],
      reasoning: "Operator note contains seller-interest and field-condition signals.",
    });

    expect(signal.observed_condition).toContain("tall grass");
    expect(signal.owner_statement).toContain("Neighbor says");
    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scout: "imagery",
          claim: "Operator field condition",
          value: expect.stringContaining("tall grass"),
          confidence: "C",
          sources: [expect.objectContaining({ name: "Operator field note" })],
        }),
        expect.objectContaining({
          scout: "people",
          claim: "Operator-captured contact signal",
          confidence: "C",
          sources: [expect.objectContaining({ name: "Operator field note" })],
        }),
        expect.objectContaining({
          scout: "imagery",
          claim: "Field photo",
          value: null,
          confidence: "D",
        }),
      ]),
    );
  });
});
