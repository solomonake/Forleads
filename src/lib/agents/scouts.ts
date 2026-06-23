// ============================================================================
// Scouts — single-source evidence gatherers under hard budgets
// (docs/Forleads_AgentLoops_v1.md §1, §2, §7). Each scout returns ONLY typed
// EvidenceCards or an explicit gap, and its output is validated downstream by
// the Reducer. Scouts never call each other.
// ============================================================================

import { nowISO } from "@/lib/core/ids";
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
  return cards.map((c) => ({ ...c, scout, created_at: c.created_at ?? nowISO() }));
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
  // Deterministic mock open-hazard signal; a real adapter would call a hazard layer.
  const cards = stamp(
    [
      {
        scout: "risk",
        claim: "Flood risk",
        value: input.lat % 0.01 > 0.005 ? "Low" : "Moderate",
        sources: [{ name: "open hazard layer" }],
        confidence: "B",
      },
    ],
    "risk"
  );
  return {
    scout: "risk",
    cards,
    gaps: [],
    cost: { ms: 120, tokens: 0, calls: 1 },
    status: "ok",
  };
}

async function runPeople(input: ScoutInput): Promise<ScoutResult> {
  // Lawful public signals ONLY — never demographics (compliance + privacy).
  const cards = stamp(
    [
      {
        scout: "people",
        claim: "Occupancy",
        value: "Likely owner-occupied",
        sources: [{ name: "public records" }],
        confidence: "C",
        reasoning: "Lawful public signals only — never demographic attributes.",
      },
    ],
    "people"
  );
  return {
    scout: "people",
    cards,
    gaps: [],
    cost: { ms: 200, tokens: 0, calls: 1 },
    status: "ok",
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
  return runner(input);
}
