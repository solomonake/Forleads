import { deterministicUuid, nowISO, uuid } from "@/lib/core/ids";
import type {
  DomainEvent,
  LoopDefinition,
  LoopRun,
  LoopRunStep,
} from "@/lib/core/types";
import type { Repository } from "@/lib/db/repository";
import { runLoop } from "./engine";

const DAY_MS = 86_400_000;

export interface ScheduledLoopSummary {
  scannedAgents: number;
  scannedDefinitions: number;
  scannedLeads: number;
  due: number;
  claimed: number;
  deduped: number;
  produced: number;
  skipped: number;
  blocked: number;
  errors: number;
  capped: boolean;
}

export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function scheduledClaimKey(
  definitionId: string,
  leadId: string,
  now: Date,
): string {
  return `scheduled-loop:${definitionId}:${leadId}:${utcDayKey(now)}`;
}

export function isScheduledRunDue(
  definition: LoopDefinition,
  runs: LoopRun[],
  leadId: string,
  now: Date,
): boolean {
  const everyDays = definition.cadence?.everyDays;
  if (!definition.active || !everyDays || everyDays <= 0) return false;

  const lastSettled = runs
    .filter(
      (run) =>
        run.loop_definition_id === definition.id &&
        run.lead_surface_id === leadId &&
        run.status !== "error" &&
        run.status !== "started",
    )
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  if (!lastSettled) return true;

  return now.getTime() - new Date(lastSettled.started_at).getTime() >= everyDays * DAY_MS;
}

function errorRun(
  definition: LoopDefinition,
  leadId: string,
  runId: string,
  now: Date,
  error: unknown,
): LoopRun {
  const message = error instanceof Error ? error.message : String(error);
  const step: LoopRunStep = {
    at: now.toISOString(),
    stage: "scheduler:error",
    detail: message,
    outcome: "fail",
  };
  return {
    id: runId,
    loop_definition_id: definition.id,
    agent_id: definition.agent_id,
    lead_surface_id: leadId,
    status: "error",
    planner_trace: [step],
    artifact_ids: [],
    started_at: step.at,
    completed_at: step.at,
  };
}

export async function runScheduledLoops(
  repo: Repository,
  options: {
    now?: Date;
    maxRuns?: number;
    executeLoop?: typeof runLoop;
  } = {},
): Promise<ScheduledLoopSummary> {
  const now = options.now ?? new Date();
  const maxRuns = Math.max(1, Math.min(options.maxRuns ?? 25, 100));
  const executeLoop = options.executeLoop ?? runLoop;
  const summary: ScheduledLoopSummary = {
    scannedAgents: 0,
    scannedDefinitions: 0,
    scannedLeads: 0,
    due: 0,
    claimed: 0,
    deduped: 0,
    produced: 0,
    skipped: 0,
    blocked: 0,
    errors: 0,
    capped: false,
  };

  const agents = await repo.listAgents();
  summary.scannedAgents = agents.length;

  for (const agent of agents) {
    const [definitions, leads, runs] = await Promise.all([
      repo.listLoopDefs(agent.id),
      repo.listLeads(agent.id),
      repo.listLoopRuns(agent.id),
    ]);
    const scheduledDefinitions = definitions.filter(
      (definition) => definition.active && Boolean(definition.cadence?.everyDays),
    );
    summary.scannedDefinitions += scheduledDefinitions.length;
    summary.scannedLeads += leads.length;

    for (const definition of scheduledDefinitions) {
      for (const lead of leads) {
        if (!isScheduledRunDue(definition, runs, lead.id, now)) continue;
        summary.due += 1;
        if (summary.claimed >= maxRuns) {
          summary.capped = true;
          return summary;
        }

        const claimKey = scheduledClaimKey(definition.id, lead.id, now);
        const runId = deterministicUuid(`forleads:${claimKey}`);
        const claim: DomainEvent = {
          id: uuid(),
          agent_id: agent.id,
          lead_surface_id: lead.id,
          type: "loop.run.started",
          payload: {
            loopDefinitionId: definition.id,
            runId,
            trigger: "vercel-cron",
            utcDay: utcDayKey(now),
          },
          source: "scheduler",
          idempotency_key: claimKey,
          created_at: nowISO(),
        };
        if (!(await repo.claimEvent(claim))) {
          summary.deduped += 1;
          continue;
        }
        summary.claimed += 1;

        try {
          const evidence = await repo.listEvidence(lead.id);
          const run = await executeLoop(
            definition,
            {
              lead,
              evidence,
              triggerSource: `cron:${utcDayKey(now)}`,
              now,
            },
            { runId },
          );
          if (run.status === "produced_artifact") summary.produced += 1;
          else if (run.status === "blocked_compliance") summary.blocked += 1;
          else summary.skipped += 1;
        } catch (error) {
          summary.errors += 1;
          await repo.saveLoopRun(errorRun(definition, lead.id, runId, now, error));
        }
      }
    }
  }

  return summary;
}
