import { describe, expect, it } from "vitest";
import { deterministicUuid } from "@/lib/core/ids";
import type {
  Agent,
  LeadSurface,
  LoopDefinition,
  LoopRun,
} from "@/lib/core/types";
import { emptyStore, InMemoryRepository } from "@/lib/db/repository";
import {
  isScheduledRunDue,
  runScheduledLoops,
  scheduledClaimKey,
} from "./scheduler";

const AGENT: Agent = {
  id: deterministicUuid("scheduler-agent"),
  name: "Scheduler Agent",
  email: "agent@example.com",
  signatureHtml: "",
  brandVoice: "warm_local",
  locale: "en-US",
  mode: "crm",
};

const LEAD: LeadSurface = {
  id: deterministicUuid("scheduler-lead"),
  agent_id: AGENT.id,
  address: "22125 Clarksburg Road",
  locality: "Clarksburg, Maryland",
  lng: -77.295714,
  lat: 39.222426,
  h3_index: "mock-h3",
  status: "nurturing",
  contact: { email: "lead@example.com" },
  first_seen_at: "2026-01-01T00:00:00.000Z",
  last_worked_at: "2026-01-01T00:00:00.000Z",
};

const DEF: LoopDefinition = {
  id: deterministicUuid("scheduler-definition"),
  agent_id: AGENT.id,
  name: "Stale lead revival",
  description: "Prepare a nurture draft on cadence.",
  trigger: { event: "task.due" },
  conditions: [{ kind: "no_activity_days", value: 30 }],
  actions: [{ type: "email", template: "nurture", requiresApproval: true }],
  cadence: { everyDays: 7 },
  active: true,
  created_at: "2026-01-01T00:00:00.000Z",
};

function successfulExecutor(repo: InMemoryRepository) {
  return async (
    definition: LoopDefinition,
    context: { lead: LeadSurface },
    options: { runId?: string } = {},
  ): Promise<LoopRun> => {
    const at = "2026-06-25T12:15:00.000Z";
    const run: LoopRun = {
      id: options.runId!,
      loop_definition_id: definition.id,
      agent_id: definition.agent_id,
      lead_surface_id: context.lead.id,
      status: "produced_artifact",
      planner_trace: [],
      artifact_ids: [deterministicUuid(`artifact:${options.runId}`)],
      started_at: at,
      completed_at: at,
    };
    await repo.saveLoopRun(run);
    return run;
  };
}

async function seededRepo() {
  const repo = new InMemoryRepository(emptyStore());
  await repo.upsertAgent(AGENT);
  await repo.upsertLead(LEAD);
  await repo.upsertLoopDef(DEF);
  return repo;
}

describe("scheduled loops", () => {
  it("derives stable daily claims and cadence due windows", () => {
    const now = new Date("2026-06-25T12:15:00.000Z");
    expect(scheduledClaimKey(DEF.id, LEAD.id, now)).toContain("2026-06-25");
    expect(isScheduledRunDue(DEF, [], LEAD.id, now)).toBe(true);
    expect(
      isScheduledRunDue(
        DEF,
        [
          {
            id: "run",
            loop_definition_id: DEF.id,
            agent_id: AGENT.id,
            lead_surface_id: LEAD.id,
            status: "produced_artifact",
            planner_trace: [],
            artifact_ids: [],
            started_at: "2026-06-24T12:15:00.000Z",
          },
        ],
        LEAD.id,
        now,
      ),
    ).toBe(false);
  });

  it("claims a due pair once and dedupes a same-day retry", async () => {
    const repo = await seededRepo();
    const now = new Date("2026-06-25T12:15:00.000Z");
    const executeLoop = successfulExecutor(repo);

    const first = await runScheduledLoops(repo, { now, executeLoop });
    const second = await runScheduledLoops(repo, { now, executeLoop });

    expect(first.claimed).toBe(1);
    expect(first.produced).toBe(1);
    expect(second.due).toBe(0);
    expect((await repo.listLoopRuns(AGENT.id))).toHaveLength(1);
  });

  it("records an error and permits a retry on the next UTC day", async () => {
    const repo = await seededRepo();
    let shouldFail = true;
    const executeLoop = async () => {
      if (shouldFail) throw new Error("temporary provider failure");
      return successfulExecutor(repo)(DEF, { lead: LEAD }, {
        runId: deterministicUuid("retry-run"),
      });
    };

    const first = await runScheduledLoops(repo, {
      now: new Date("2026-06-25T12:15:00.000Z"),
      executeLoop,
    });
    const sameDay = await runScheduledLoops(repo, {
      now: new Date("2026-06-25T18:00:00.000Z"),
      executeLoop,
    });
    shouldFail = false;
    const nextDay = await runScheduledLoops(repo, {
      now: new Date("2026-06-26T12:15:00.000Z"),
      executeLoop,
    });

    expect(first.errors).toBe(1);
    expect(sameDay.deduped).toBe(1);
    expect(nextDay.claimed).toBe(1);
    expect(nextDay.produced).toBe(1);
  });
});
