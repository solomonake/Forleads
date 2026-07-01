export interface QuotaResult {
  ok: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

export interface QuotaGate {
  check(key: string, limit: number, windowMs: number): QuotaResult;
}

export class InMemoryQuotaGate implements QuotaGate {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  check(key: string, limit: number, windowMs: number): QuotaResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (this.buckets.size > 5000) this.sweep(now);
    return {
      ok: bucket.count <= limit,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetMs: Math.max(0, bucket.resetAt - now),
    };
  }

  private sweep(now: number): void {
    for (const [key, value] of this.buckets) {
      if (now >= value.resetAt) this.buckets.delete(key);
    }
  }
}

interface QuotaGlobal {
  __forleadsQuotaGate?: QuotaGate;
}

const g = globalThis as unknown as QuotaGlobal;

export function getQuotaGate(): QuotaGate {
  if (!g.__forleadsQuotaGate) g.__forleadsQuotaGate = new InMemoryQuotaGate();
  return g.__forleadsQuotaGate;
}
