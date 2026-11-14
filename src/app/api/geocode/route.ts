// GET /api/geocode?q=...            — as-you-type suggestions (Photon in
//                                     production, mock gazetteer locally)
// GET /api/geocode?q=...&resolve=1  — one explicit lookup, used only when the
//                                     user presses Enter with nothing suggested
//                                     (public Nominatim in production)
//
// Upstream fair use (see providers/real.ts): results are cached server-side
// for 24 h, short queries never leave the server, and each client IP has a
// per-minute budget. Nominatim calls are also serialized to ≤1 req/s.
import { NextRequest, NextResponse } from "next/server";
import { InMemoryCache, type CacheStore } from "@/lib/cache";
import { MIN_GEOCODE_QUERY, normalizeGeocodeQuery } from "@/lib/geocode/query";
import { log, withRoute } from "@/lib/observability";
import { getGeocodeProvider } from "@/lib/providers";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { GeoResult } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SUGGEST_LIMIT = 6;
/** Per IP per minute. A 350 ms client debounce makes ~20/min a fast typist. */
export const SUGGEST_PER_IP_PER_MIN = 40;
export const RESOLVE_PER_IP_PER_MIN = 6;

// Survives module reloads within a warm instance, like the rate limiter.
const g = globalThis as unknown as { __forleadsGeocodeCache?: CacheStore };
function cache(): CacheStore {
  if (!g.__forleadsGeocodeCache) g.__forleadsGeocodeCache = new InMemoryCache();
  return g.__forleadsGeocodeCache;
}

export const GET = withRoute("geocode", async (req: NextRequest) => {
  const q = normalizeGeocodeQuery(req.nextUrl.searchParams.get("q") ?? "");
  const resolve = req.nextUrl.searchParams.get("resolve") === "1";
  const provider = getGeocodeProvider();
  const meta = { provider: provider.name, mode: provider.mode };

  if (q.length < MIN_GEOCODE_QUERY) {
    return NextResponse.json(resolve ? { result: null, ...meta } : { results: [], ...meta });
  }

  const limited = enforceRateLimit(req, {
    name: resolve ? "geocode-resolve" : "geocode",
    perAgent: 0,
    perIp: resolve ? RESOLVE_PER_IP_PER_MIN : SUGGEST_PER_IP_PER_MIN,
  });
  if (limited) return limited;

  const key = `${provider.name}:${resolve ? "resolve" : "suggest"}:${q.toLowerCase()}`;
  const hit = cache().get<GeoResult[] | GeoResult | null>(key);
  const headers = { "x-geocode-cache": hit === undefined ? "miss" : "hit" };
  if (hit !== undefined) {
    return NextResponse.json(resolve ? { result: hit, ...meta } : { results: hit, ...meta }, { headers });
  }

  try {
    if (resolve) {
      const result = await provider.resolve(q);
      cache().set(key, result, CACHE_TTL_MS);
      return NextResponse.json({ result, ...meta }, { headers });
    }
    const results = await provider.autocomplete(q, SUGGEST_LIMIT);
    cache().set(key, results, CACHE_TTL_MS);
    return NextResponse.json({ results, ...meta }, { headers });
  } catch (error) {
    // Upstream down or throttling us: say so, and don't cache the failure.
    log("warn", "geocode.upstream_failed", {
      provider: provider.name,
      resolve,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "address search is unavailable", ...meta }, { status: 502 });
  }
});
