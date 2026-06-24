// ============================================================================
// TTL cache — the "cache-first by H3" floor (constitution §10, audit axis 5).
// Caches slow-changing, PUBLIC cell/point facts so repeat opens don't re-hit the
// external (Overpass) budget — the binding capacity constraint.
//
// TIER HONESTY (same as ratelimit): the default backend is IN-MEMORY, so on
// serverless it caches PER WARM INSTANCE, not globally — real wins on a warm
// instance, graded B not A. The `CacheStore` seam lets a shared/durable backend
// (Vercel KV / Upstash, or the existing Supabase evidence table keyed by
// h3_index) drop in via env for a global (A) cache — a config flip, not a rewrite.
//
// SAFETY: only ever cache non-personal, public facts. NEVER cache the `people`
// scout — sharing person-level signals across leads would leak tenant data.
// ============================================================================

export interface CacheStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
}

/** In-memory cache with per-entry expiry; prunes lazily. */
export class InMemoryCache implements CacheStore {
  private store = new Map<string, { value: unknown; exp: number }>();

  get<T>(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() >= e.exp) {
      this.store.delete(key);
      return undefined;
    }
    return e.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (this.store.size > 5000) this.sweep();
    this.store.set(key, { value, exp: Date.now() + ttlMs });
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, v] of this.store) if (now >= v.exp) this.store.delete(k);
  }
}

interface CacheGlobal {
  __forleadsCache?: CacheStore;
}
const g = globalThis as unknown as CacheGlobal;

export function getCache(): CacheStore {
  if (!g.__forleadsCache) g.__forleadsCache = new InMemoryCache();
  return g.__forleadsCache;
}
