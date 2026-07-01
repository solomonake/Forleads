import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryQuotaGate } from "./quota";

describe("InMemoryQuotaGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit, then blocks", () => {
    const quota = new InMemoryQuotaGate();
    expect(quota.check("agent-a", 2, 1000).ok).toBe(true);
    expect(quota.check("agent-a", 2, 1000).ok).toBe(true);
    expect(quota.check("agent-a", 2, 1000).ok).toBe(false);
  });

  it("resets after the quota window", () => {
    const quota = new InMemoryQuotaGate();
    quota.check("agent-a", 1, 1000);
    expect(quota.check("agent-a", 1, 1000).ok).toBe(false);
    vi.setSystemTime(1001);
    expect(quota.check("agent-a", 1, 1000).ok).toBe(true);
  });
});
