// ============================================================================
// Rate limiting — per-principal (IP + agent) budget guards on the expensive and
// externally-bound routes (audit axis 4; defends the Overpass binding constraint
// documented in .agent/audits/2026-06-23-capacity-envelope.md).
//
// TIER HONESTY: the default backend is IN-MEMORY (fixed window), which on
// serverless limits PER WARM INSTANCE, not globally — it catches the common
// single-client abuse case at ≈$0 with no deps, but it is NOT a distributed
// limiter. It is graded B, not A. The `RateLimiter` seam lets a shared backend
// (Vercel KV / Upstash, free tier) drop in for true global limiting — "going
// live" is a config flip, not a rewrite. See the README in this file's tests.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getQuotaGate, type QuotaGate } from "./quota";

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetMs: number; // ms until the window resets
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): RateLimitResult;
}

/** Fixed-window counter. Dependency-free; prunes expired keys lazily. */
export class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, b);
    }
    b.count++;
    if (this.buckets.size > 5000) this.sweep(now);
    return {
      ok: b.count <= limit,
      limit,
      remaining: Math.max(0, limit - b.count),
      resetMs: Math.max(0, b.resetAt - now),
    };
  }

  private sweep(now: number): void {
    for (const [k, v] of this.buckets) if (now >= v.resetAt) this.buckets.delete(k);
  }
}

// Survive Next.js HMR / module reloads so counters persist within an instance.
interface RLGlobal {
  __forleadsRateLimiter?: RateLimiter;
}
const g = globalThis as unknown as RLGlobal;
export function getRateLimiter(): RateLimiter {
  if (!g.__forleadsRateLimiter) g.__forleadsRateLimiter = new InMemoryRateLimiter();
  return g.__forleadsRateLimiter;
}

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export interface RateLimitOptions {
  name: string; // route bucket, e.g. "lead"
  agentId?: string | null; // session agent (per-tenant budget)
  perAgent: number; // requests / window for one agent
  perIp: number; // requests / window for one IP
  windowMs?: number; // default 60s
  quota?: {
    tenantKey: string;
    limit: number;
    windowMs?: number;
    gate?: QuotaGate;
  };
}

/**
 * Enforce both the per-agent and per-IP budgets for a route. Returns a ready 429
 * `NextResponse` (with `Retry-After` + `X-RateLimit-*`) when either is exceeded,
 * or `null` to proceed. The per-IP bucket catches abuse before/without auth; the
 * per-agent bucket gives each tenant a fair share of the shared external budget.
 */
export function enforceRateLimit(req: NextRequest, opts: RateLimitOptions): NextResponse | null {
  const windowMs = opts.windowMs ?? 60_000;
  const limiter = getRateLimiter();
  const ip = clientIp(req);
  const quotaGate = opts.quota?.gate ?? getQuotaGate();
  const quotaRes = opts.quota
    ? quotaGate.check(
        `${opts.name}:quota:${opts.quota.tenantKey}`,
        opts.quota.limit,
        opts.quota.windowMs ?? 86_400_000,
      )
    : null;

  const ipRes = limiter.check(`${opts.name}:ip:${ip}`, opts.perIp, windowMs);
  const agentRes = opts.agentId
    ? limiter.check(`${opts.name}:agent:${opts.agentId}`, opts.perAgent, windowMs)
    : null;

  const blocked = quotaRes && !quotaRes.ok
    ? { reason: "daily_quota" as const, result: quotaRes }
    : !ipRes.ok
      ? { reason: "rate_limit" as const, result: ipRes }
      : agentRes && !agentRes.ok
        ? { reason: "rate_limit" as const, result: agentRes }
        : null;
  if (!blocked) return null;

  const retryAfter = Math.ceil(blocked.result.resetMs / 1000);
  return NextResponse.json(
    {
      error: blocked.reason === "daily_quota" ? "daily quota exceeded" : "rate limit exceeded",
      reason: blocked.reason,
      retryAfterSeconds: retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(blocked.result.limit),
        "X-RateLimit-Remaining": String(blocked.result.remaining),
        "X-RateLimit-Reset": String(Math.ceil((Date.now() + blocked.result.resetMs) / 1000)),
      },
    },
  );
}
