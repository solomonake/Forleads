// ============================================================================
// Dispatcher — the ONLY planner. Decomposes intent → picks scouts → sets hard
// budgets + source allowlists (docs/Forleads_AgentLoops_v1.md §3).
// Bounded parallelism <= 5; scouts never call each other.
// ============================================================================

import { getPropertyProvider } from "@/lib/providers";
import type {
  DispatchPlan,
  LeadStatus,
  ScoutBudget,
  ScoutJob,
  ScoutType,
} from "@/lib/core/types";

const BUDGETS: Record<ScoutType, ScoutBudget> = {
  property: { maxCalls: 2, maxMs: 4000, maxTokens: 2000 },
  imagery: { maxCalls: 3, maxMs: 6000, maxTokens: 3000 },
  people: { maxCalls: 2, maxMs: 4000, maxTokens: 2000 },
  market: { maxCalls: 3, maxMs: 6000, maxTokens: 3000 },
  risk: { maxCalls: 2, maxMs: 4000, maxTokens: 2000 },
};

const ALLOWLISTS: Record<ScoutType, string[]> = {
  property: ["OpenStreetMap", "OSM", "public records"],
  imagery: ["Mapillary", "Esri", "Imagery Scout"],
  people: ["public records"],
  market: ["MLS", "ATTOM", "OSM"],
  risk: ["open hazard layer"],
};

export interface DispatchInput {
  lng: number;
  lat: number;
  address: string;
  status: LeadStatus;
  priorMemoryRefs?: string[];
  /** Tighten budgets if the agent is near a daily free-tier cap. */
  nearDailyCap?: boolean;
}

export async function planDispatch(input: DispatchInput): Promise<DispatchPlan> {
  const scouts: ScoutJob[] = [];
  const notes: string[] = [];

  const tighten = (b: ScoutBudget): ScoutBudget =>
    input.nearDailyCap
      ? { maxCalls: Math.max(1, b.maxCalls - 1), maxMs: Math.round(b.maxMs * 0.7), maxTokens: Math.round(b.maxTokens * 0.7) }
      : b;

  const add = (type: ScoutType, why: string) =>
    scouts.push({ type, budget: tighten(BUDGETS[type]), why, allowlist: ALLOWLISTS[type] });

  // Always-on cheap global scouts.
  add("property", "Building/parcel/land-use facts from the free OSM floor.");
  add("imagery", "Street + aerial imagery with a graded vision caption.");
  add("risk", "Flood/zoning/area context from open hazard layers.");

  // People only for fresh leads.
  if (input.status === "new" || input.status === "researching") {
    add("people", "Who to contact via lawful public-record signals only.");
  }

  // Market only if a provider beyond the OSM floor has coverage; else honest gap.
  const provider = getPropertyProvider();
  const covered = await provider.hasCoverage(input.lng, input.lat);
  if (provider.name !== "osm-mock" && provider.name !== "osm" && covered) {
    add("market", "Comps & resale graded by confidence via per-market provider.");
  } else {
    // Still run market to emit the honest grade-D gap card (never silent).
    add("market", "Emit an honest grade-D gap: no market data source for this market.");
    notes.push("No richer-than-OSM market provider configured — market will grade D.");
  }

  if (input.nearDailyCap) notes.push("Near daily free-tier cap — budgets tightened.");

  return {
    scouts: scouts.slice(0, 5), // bounded parallelism
    memory_used: input.priorMemoryRefs ?? [],
    notes,
  };
}
