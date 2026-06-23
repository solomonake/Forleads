import { describe, it, expect } from "vitest";
import { lintCompliance } from "./compliance";

describe("fair-housing compliance linter (fail-closed)", () => {
  it("passes neutral, grounded copy", () => {
    const r = lintCompliance(
      "Hi there, I stopped by your home today and was struck by how well-kept the garden is."
    );
    expect(r.pass).toBe(true);
    expect(r.flags).toHaveLength(0);
  });

  it("blocks familial-status steering ('great for families')", () => {
    const r = lintCompliance("This home is great for families with young kids.");
    expect(r.pass).toBe(false);
    expect(r.flags.some((f) => f.category === "familial_status")).toBe(true);
  });

  it("blocks reference to children ('kids' bikes')", () => {
    const r = lintCompliance("Nice yard, kids' bikes out front.");
    expect(r.pass).toBe(false);
    expect(r.flags.some((f) => f.severity === "block")).toBe(true);
  });

  it("blocks religious steering ('near churches')", () => {
    const r = lintCompliance("Lovely spot, close to churches and temples.");
    expect(r.pass).toBe(false);
    expect(r.flags.some((f) => f.category === "religion")).toBe(true);
  });

  it("blocks racial/ethnic area description", () => {
    const r = lintCompliance("It's in a great white neighborhood.");
    expect(r.pass).toBe(false);
    expect(r.flags.some((f) => f.category === "race_national_origin")).toBe(true);
  });

  it("warns but does not block softer language", () => {
    const r = lintCompliance("Perfect for retirees looking to slow down.");
    // age targeting is a warn, not a block → still approvable but flagged.
    expect(r.flags.some((f) => f.category === "age")).toBe(true);
    expect(r.pass).toBe(true);
  });

  it("returns a linter version for audit", () => {
    expect(lintCompliance("hello").linterVersion).toBeTruthy();
  });
});
