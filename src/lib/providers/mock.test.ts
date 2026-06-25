import { describe, expect, it } from "vitest";
import { MockGeocodeProvider, synthesizeGeoResult } from "./mock";

describe("mock geocoder freeform fallback", () => {
  it("synthesizes a stable result for arbitrary typed addresses", async () => {
    const a = synthesizeGeoResult("22125 Clarksburg Rd, Maryland");
    const b = synthesizeGeoResult("22125 Clarksburg Rd, Maryland");
    expect(a).toBeTruthy();
    expect(a).toEqual(b);
    expect(a?.mode).toBe("synthetic");
    expect(a?.locality).toContain("Maryland");
  });

  it("returns a usable suggestion even when the catalog has no direct match", async () => {
    const provider = new MockGeocodeProvider();
    const results = await provider.autocomplete("22125 Clarksburg Rd, Maryland", 6);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.address).toContain("Clarksburg");
    expect(results[0]?.mode).toBe("synthetic");
  });
});
