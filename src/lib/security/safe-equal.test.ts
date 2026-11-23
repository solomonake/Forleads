import { describe, expect, it } from "vitest";
import { safeEqual } from "./safe-equal";

describe("safeEqual", () => {
  it("matches identical secrets", () => {
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
  });
  it("rejects different values and lengths without throwing", () => {
    expect(safeEqual("Bearer abc", "Bearer abd")).toBe(false);
    expect(safeEqual("short", "a much longer secret")).toBe(false);
  });
  it("rejects missing or empty expected secrets", () => {
    expect(safeEqual(null, "x")).toBe(false);
    expect(safeEqual("", "")).toBe(false);
    expect(safeEqual("x", undefined)).toBe(false);
  });
});
