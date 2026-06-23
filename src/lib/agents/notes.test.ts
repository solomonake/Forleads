import { describe, it, expect } from "vitest";
import { classifyNote } from "./notes";

describe("note classification", () => {
  it("classifies a no-answer door knock as no_contact", () => {
    const r = classifyNote("Knocked, no answer. Nice yard.");
    expect(r.situation).toBe("no_contact");
    expect(r.suggested_actions[0]?.recommended).toBe(true);
  });

  it("classifies a downsizer as interested_seller", () => {
    const r = classifyNote("Owner said the house feels too big since the kids moved out.");
    expect(r.situation).toBe("interested_seller");
  });

  it("classifies a timing objection", () => {
    const r = classifyNote("Seller worried it's the wrong time to sell.");
    expect(r.situation).toBe("objection:timing");
  });

  it("classifies a buyer criteria note", () => {
    const r = classifyNote("Buyer wants a 3-bed under $500k with a garden.");
    expect(r.situation).toBe("buyer_criteria");
  });

  it("falls back to unknown with a safe follow-up action", () => {
    const r = classifyNote("xyzzy random text");
    expect(r.situation).toBe("unknown");
    expect(r.suggested_actions.length).toBeGreaterThan(0);
  });

  it("always returns a recommended action", () => {
    for (const note of ["no answer", "downsizing", "wrong time", "needs repairs", "not interested"]) {
      const r = classifyNote(note);
      expect(r.suggested_actions.some((a) => a.recommended)).toBe(true);
    }
  });
});
