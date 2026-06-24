import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryCache } from "./index";

describe("InMemoryCache (TTL)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it("returns a stored value within its TTL", () => {
    const c = new InMemoryCache();
    c.set("k", { n: 1 }, 1000);
    expect(c.get<{ n: number }>("k")).toEqual({ n: 1 });
  });

  it("expires the value after the TTL", () => {
    const c = new InMemoryCache();
    c.set("k", 42, 1000);
    vi.setSystemTime(1001);
    expect(c.get("k")).toBeUndefined();
  });

  it("misses on an unknown key", () => {
    expect(new InMemoryCache().get("nope")).toBeUndefined();
  });
});
