// ============================================================================
// Scouts — single-source evidence gatherers under hard budgets
// (docs/Forleads_AgentLoops_v1.md §1, §2, §7). Each scout returns ONLY typed
// EvidenceCards or an explicit gap, and its output is validated downstream by
// the Reducer. Scouts never call each other.
// ============================================================================

import { getCache } from "@/lib/cache";
import { addressKey, h3Key } from "@/lib/core/geo";
import { nowISO, uuid } from "@/lib/core/ids";
import type {
  EvidenceCard,
  ScoutJob,
  ScoutResult,
  ScoutType,
} from "@/lib/core/types";
import {
  getImageryProvider,
  getPropertyProvider,
} from "@/lib/providers";
import type { PropertyQuery } from "@/lib/providers";

export interface ScoutInput {
  lng: number;
  lat: number;
  address: string;
  job: ScoutJob;
}

/** Enforce a soft time budget around an async scout body. */
async function withBudget<T>(
  maxMs: number,
  fallback: T,
  body: () => Promise<T>
): Promise<{ value: T; timedOut: boolean; ms: number }> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), maxMs);
  });
  try {
    const raced = await Promise.race([
      body().then((value) => ({ value, timedOut: false as const })),
      timeout,
    ]);
    if ("timedOut" in raced && raced.timedOut) {
      return { value: fallback, timedOut: true, ms: Date.now() - start };
    }
    return {
      value: (raced as { value: T }).value,
      timedOut: false,
      ms: Date.now() - start,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stamp(cards: EvidenceCard[], scout: ScoutType): EvidenceCard[] {
  // Every card gets a stable id at stamp time so the memory layer can store a
  // ref back to the source card. Without this, the recalled-memories chip in
  // the lead rail can't jump-to-card on click — every evidence hit's ref is
  // undefined because nothing else in the pipeline assigns ids.
  return cards.map((c) => ({
    ...c,
    id: c.id ?? uuid(),
    scout,
    created_at: c.created_at ?? nowISO(),
  }));
}

async function runProperty(input: ScoutInput): Promise<ScoutResult> {
  const provider = getPropertyProvider();
  const q: PropertyQuery = { ...input, scout: "property" };
  const { value, timedOut, ms } = await withBudget(input.job.budget.maxMs, [], () =>
    provider.facts(q)
  );
  const cards = stamp(value, "property");
  return {
    scout: "property",
    cards,
    gaps: cards.length === 0 ? ["No property facts found"] : [],
    cost: { ms, tokens: 0, calls: 1 },
    status: timedOut ? "budget_exceeded" : cards.length ? "ok" : "insufficient_evidence",
  };
}

async function runImagery(input: ScoutInput): Promise<ScoutResult> {
  const provider = getImageryProvider();
  const q: PropertyQuery = { ...input, scout: "imagery" };
  const { value, timedOut, ms } = await withBudget(input.job.budget.maxMs, [], () =>
    provider.street(q)
  );
  const cards = stamp(value, "imagery");
  return {
    scout: "imagery",
    cards,
    gaps: cards.some((c) => c.confidence === "D") ? ["Limited imagery coverage"] : [],
    cost: { ms, tokens: 0, calls: 2 },
    status: timedOut ? "budget_exceeded" : "ok",
  };
}

async function runMarket(input: ScoutInput): Promise<ScoutResult> {
  const provider = getPropertyProvider();
  const q: PropertyQuery = { ...input, scout: "market" };
  const { value, timedOut, ms } = await withBudget(input.job.budget.maxMs, [], () =>
    provider.comps(q)
  );
  const cards = stamp(value, "market");
  const insufficient = cards.every((c) => c.confidence === "D");
  return {
    scout: "market",
    cards,
    gaps: insufficient ? ["No market data source for this market"] : [],
    cost: { ms, tokens: 0, calls: 1 },
    status: insufficient ? "insufficient_evidence" : timedOut ? "budget_exceeded" : "ok",
  };
}

async function runRisk(input: ScoutInput): Promise<ScoutResult> {
  // No risk provider is configured yet. An honest gap is safer than deriving a
  // plausible-looking flood result from coordinates.
  const cards = stamp(
    [
      {
        scout: "risk",
        claim: "Flood risk",
        value: null,
        sources: [],
        confidence: "D",
        reasoning: "No verified hazard provider is configured for this market.",
      },
    ],
    "risk"
  );
  return {
    scout: "risk",
    cards,
    gaps: ["No verified risk provider configured"],
    cost: { ms: 0, tokens: 0, calls: 0 },
    status: "insufficient_evidence",
  };
}

async function runPeople(input: ScoutInput): Promise<ScoutResult> {
  // Never infer occupancy from an address alone. A real people provider must
  // supply a lawful, cited public-record signal.
  const cards = stamp(
    [
      {
        scout: "people",
        claim: "Occupancy",
        value: null,
        sources: [],
        confidence: "D",
        reasoning: "No lawful public-record provider is configured.",
      },
    ],
    "people"
  );
  return {
    scout: "people",
    cards,
    gaps: ["No lawful people-data provider configured"],
    cost: { ms: 0, tokens: 0, calls: 0 },
    status: "insufficient_evidence",
  };
}

const RUNNERS: Record<ScoutType, (i: ScoutInput) => Promise<ScoutResult>> = {
  property: runProperty,
  imagery: runImagery,
  market: runMarket,
  risk: runRisk,
  people: runPeople,
};

export async function runScout(input: ScoutInput): Promise<ScoutResult> {
  const runner = RUNNERS[input.job.type];
  const result = await runner(input);
  const allowed = input.job.allowlist.map((source) => source.toLowerCase());
  const cards = result.cards.filter((card) =>
    card.confidence === "D" ||
    card.sources.every((source) =>
      allowed.some((entry) => source.name.toLowerCase().includes(entry)),
    ),
  );
  const rejected = result.cards.length - cards.length;
  return {
    ...result,
    cards,
    gaps: rejected
      ? [...result.gaps, `${rejected} card(s) rejected: source outside scout allowlist`]
      : result.gaps,
    cost: {
      ...result.cost,
      calls: Math.min(result.cost.calls, input.job.budget.maxCalls),
      tokens: Math.min(result.cost.tokens, input.job.budget.maxTokens),
    },
    status: rejected && cards.length === 0 ? "insufficient_evidence" : result.status,
  };
}

// ---- Cache-first by H3 (constitution §10, audit axis 5) ---------------------

// OSM-floor facts change slowly; 6h keeps cost ≈ $0 while staying fresh enough.
const SCOUT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * The cache key at the granularity that is actually CORRECT for each scout:
 * - property/imagery are POINT-specific → keyed by normalized address (an H3
 *   res-10 cell is ~65m and can hold several distinct buildings, so caching
 *   building facts by cell would be wrong).
 * - risk/market are AREA-level → keyed by H3 cell (legitimately shared).
 * - people is NEVER cached (personal signals must not leak across leads).
 */
function scoutCacheKey(input: ScoutInput): string | null {
  switch (input.job.type) {
    case "property":
    case "imagery":
      return `scout:${input.job.type}:addr:${addressKey(input.address)}`;
    case "risk":
    case "market":
      return `scout:${input.job.type}:h3:${h3Key(input.lng, input.lat)}`;
    default:
      return null; // people → never cache
  }
}

/**
 * Cache-first scout runner. On a fresh hit, returns the cached result WITHOUT
 * re-running the scout (and thus without re-hitting the external budget). Only
 * caches clean `ok` results — never a transient `budget_exceeded` timeout.
 */
export async function runScoutCached(input: ScoutInput): Promise<ScoutResult> {
  const key = scoutCacheKey(input);
  if (!key) return runScout(input);

  const cache = getCache();
  const hit = cache.get<ScoutResult>(key);
  if (hit) return { ...hit, cost: { ...hit.cost, cacheHit: true, calls: 0, tokens: 0 } };

  const result = await runScout(input);
  if (result.status === "ok") cache.set(key, result, SCOUT_CACHE_TTL_MS);
  return result;
}
