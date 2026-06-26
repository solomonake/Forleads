import type { LeadSurface, LoopDefinition, LoopRun, LoopRunStatus } from "@/lib/core/types";

const DAY_MS = 86_400_000;

export type LoopScheduleState = "paused" | "event_driven" | "due_now" | "waiting";

export interface LoopObservability {
  loopId: string;
  state: LoopScheduleState;
  trackedLeads: number;
  dueNow: number;
  nextDueAt?: string;
  lastRunAt?: string;
  lastRunStatus?: LoopRunStatus;
  lastLeadId?: string;
}

function leadRunMatches(run: LoopRun, definition: LoopDefinition, lead: LeadSurface) {
  return run.loop_definition_id === definition.id && run.lead_surface_id === lead.id;
}

function successfulRun(run: LoopRun) {
  return run.status !== "error" && run.status !== "started";
}

function latestRun(runs: LoopRun[]) {
  return [...runs].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
}

function addDays(iso: string, days: number) {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

export function leadLabels(leads: LeadSurface[]): Record<string, string> {
  return Object.fromEntries(
    leads.map((lead) => [lead.id, lead.label || lead.address || "Unknown lead"]),
  );
}

export function deriveLoopObservability(input: {
  definitions: LoopDefinition[];
  leads: LeadSurface[];
  runs: LoopRun[];
  now?: Date;
}): Record<string, LoopObservability> {
  const now = input.now ?? new Date();
  const summaries: Record<string, LoopObservability> = {};

  for (const definition of input.definitions) {
    const definitionRuns = input.runs.filter((run) => run.loop_definition_id === definition.id);
    const last = latestRun(definitionRuns);
    const base: LoopObservability = {
      loopId: definition.id,
      state: definition.active ? "event_driven" : "paused",
      trackedLeads: input.leads.length,
      dueNow: 0,
      lastRunAt: last?.started_at,
      lastRunStatus: last?.status,
      lastLeadId: last?.lead_surface_id,
    };

    const everyDays = definition.cadence?.everyDays;
    if (!definition.active) {
      summaries[definition.id] = base;
      continue;
    }
    if (!everyDays || everyDays <= 0) {
      summaries[definition.id] = base;
      continue;
    }

    let dueNow = 0;
    let nextDueMs: number | null = null;
    for (const lead of input.leads) {
      const settled = latestRun(definitionRuns.filter((run) => leadRunMatches(run, definition, lead) && successfulRun(run)));
      if (!settled) {
        dueNow += 1;
        continue;
      }
      const dueAt = new Date(addDays(settled.started_at, everyDays));
      if (dueAt.getTime() <= now.getTime()) {
        dueNow += 1;
      } else if (nextDueMs == null || dueAt.getTime() < nextDueMs) {
        nextDueMs = dueAt.getTime();
      }
    }

    summaries[definition.id] = {
      ...base,
      state: dueNow > 0 ? "due_now" : "waiting",
      dueNow,
      nextDueAt: nextDueMs == null ? undefined : new Date(nextDueMs).toISOString(),
    };
  }

  return summaries;
}
