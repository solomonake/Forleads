import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { enforceRateLimit, InMemoryRateLimiter } from "./index";

describe("InMemoryRateLimiter (fixed window)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it("allows up to the limit, then blocks", () => {
    const rl = new InMemoryRateLimiter();
    const hits = Array.from({ length: 3 }, () => rl.check("k", 3, 1000).ok);
    expect(hits).toEqual([true, true, true]);
    expect(rl.check("k", 3, 1000).ok).toBe(false); // 4th in window
  });

  it("reports remaining and resetMs", () => {
    const rl = new InMemoryRateLimiter();
    const r = rl.check("k", 5, 1000);
    expect(r).toMatchObject({ ok: true, limit: 5, remaining: 4, resetMs: 1000 });
  });

  it("resets after the window elapses", () => {
    const rl = new InMemoryRateLimiter();
    rl.check("k", 1, 1000);
    expect(rl.check("k", 1, 1000).ok).toBe(false);
    vi.setSystemTime(1001);
    expect(rl.check("k", 1, 1000).ok).toBe(true); // fresh window
  });

  it("isolates distinct keys (IP vs agent, tenant vs tenant)", () => {
    const rl = new InMemoryRateLimiter();
    rl.check("lead:agent:a", 1, 1000);
    expect(rl.check("lead:agent:a", 1, 1000).ok).toBe(false);
    expect(rl.check("lead:agent:b", 1, 1000).ok).toBe(true); // other tenant unaffected
    expect(rl.check("lead:ip:1.2.3.4", 1, 1000).ok).toBe(true);
  });
});

describe("enforceRateLimit (route glue)", () => {
  beforeEach(() => {
    (globalThis as unknown as { __forleadsRateLimiter?: unknown }).__forleadsRateLimiter = undefined;
  });
  const req = (ip: string) =>
    new NextRequest("http://localhost/api/lead", { headers: { "x-forwarded-for": ip } });

  it("returns null under budget, then a 429 with Retry-After over the IP budget", () => {
    const r = req("9.9.9.9");
    for (let i = 0; i < 3; i++) {
      expect(enforceRateLimit(r, { name: "t", agentId: "x", perAgent: 100, perIp: 3 })).toBeNull();
    }
    const blocked = enforceRateLimit(r, { name: "t", agentId: "x", perAgent: 100, perIp: 3 });
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBeTruthy();
  });

  it("blocks on the per-agent budget across different IPs (tenant fair share)", () => {
    const opts = { name: "t2", agentId: "agentX", perAgent: 1, perIp: 100 };
    expect(enforceRateLimit(req("1.1.1.1"), opts)).toBeNull();
    expect(enforceRateLimit(req("2.2.2.2"), opts)?.status).toBe(429); // same agent, new IP
  });
});
