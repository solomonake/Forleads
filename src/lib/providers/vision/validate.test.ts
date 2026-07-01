import { describe, expect, it } from "vitest";
import { validateCaption } from "./validate";

const frames = [
  { id: "f1", url: "https://images.example/f1.jpg" },
  { id: "f2", url: "https://images.example/f2.jpg" },
];

describe("validateCaption", () => {
  it("maps allowed claims into imagery evidence cards", () => {
    const cards = validateCaption(
      {
        captions: [
          {
            claim: "roof",
            value: "Pitched roof visible from the street",
            confidence: "B",
            reasoning: "Roof ridge is clearly visible in two frames.",
          },
        ],
      },
      frames,
      "gemini-2.5-flash",
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      scout: "imagery",
      claim: "Roof form (vision)",
      confidence: "B",
    });
  });

  it("downgrades grade-A visual claims to C", () => {
    const cards = validateCaption(
      {
        captions: [{ claim: "style", value: "Brick-front townhouse", confidence: "A" }],
      },
      frames,
      "gemini-2.5-flash",
    );
    expect(cards[0]?.confidence).toBe("C");
  });

  it("rejects hidden-fact assertions", () => {
    const cards = validateCaption(
      {
        captions: [{ claim: "condition", value: "Needs a new roof soon", confidence: "B" }],
      },
      frames,
      "gemini-2.5-flash",
    );
    expect(cards).toEqual([]);
  });

  it("rejects demographic-adjacent phrasing", () => {
    const cards = validateCaption(
      {
        captions: [{ claim: "landscaping", value: "Ideal for families with kids", confidence: "C" }],
      },
      frames,
      "gemini-2.5-flash",
    );
    expect(cards).toEqual([]);
  });

  it("caps the output to four cards and drops unknown claims", () => {
    const cards = validateCaption(
      {
        captions: [
          { claim: "style", value: "Brick front", confidence: "B" },
          { claim: "condition", value: "Well-kept exterior", confidence: "C" },
          { claim: "stories", value: "Two stories visible", confidence: "C" },
          { claim: "materials", value: "Brick and siding", confidence: "C" },
          { claim: "roof", value: "Gabled roof", confidence: "C" },
          { claim: "unknown", value: "ignored", confidence: "C" },
        ],
      },
      frames,
      "gemini-2.5-flash",
    );
    expect(cards).toHaveLength(4);
  });
});
