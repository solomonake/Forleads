import { describe, expect, it } from "vitest";
import type { LeadSurface, LoopDefinition, LoopRun } from "@/lib/core/types";
import { deriveLoopObservability, leadLabels } from "./observability";

const lead: LeadSurface = {
  id: "lead-1",
  agent_id: "agent-1",
  address: "22125 Clarksburg Road",
  lng: -77.295714,
  lat: 39.222426,
  h3_index: "mock-h3",
  status: "nurturing",
  first_seen_at: "2026-01-01T00:00:00.000Z",
  last_worked_at: "2026-01-01T00:00:00.000Z",
};

const scheduled: LoopDefinition = {
  id: "loop-scheduled",
  agent_id: "agent-1",
  name: "Stale lead revival",
  description: "Prepare a nurture draft on cadence.",
  trigger: { event: "task.due" },
  conditions: [],
  actions: [{ type: "email", template: "nurture", requiresApproval: true }],
  cadence: { everyDays: 7 },
  active: true,
  created_at: "2026-01-01T00:00:00.000Z",
};

function run(overrides: Partial<LoopRun>): LoopRun {
  return {
    id: "run-1",
    loop_definition_id: scheduled.id,
    agent_id: "agent-1",
    lead_surface_id: lead.id,
    status: "produced_artifact",
    planner_trace: [],
    artifact_ids: [],
    started_at: "2026-06-20T12:00:00.000Z",
    ...overrides,
  };
}

describe("loop observability", () => {
  it("marks scheduled loops due when a tracked lead has no settled run", () => {
    const summary = deriveLoopObservability({
      definitions: [scheduled],
      leads: [lead],
      runs: [],
      now: new Date("2026-06-25T12:00:00.000Z"),
    })[scheduled.id];

    expect(summary).toMatchObject({
      loopId: scheduled.id,
      state: "due_now",
      trackedLeads: 1,
      dueNow: 1,
    });
  });

  it("shows the next due timestamp when the latest settled run is still fresh", () => {
    const summary = deriveLoopObservability({
      definitions: [scheduled],
      leads: [lead],
      runs: [run({ started_at: "2026-06-24T12:00:00.000Z" })],
      now: new Date("2026-06-25T12:00:00.000Z"),
    })[scheduled.id];

    expect(summary).toMatchObject({
      state: "waiting",
      dueNow: 0,
      nextDueAt: "2026-07-01T12:00:00.000Z",
      lastRunAt: "2026-06-24T12:00:00.000Z",
      lastRunStatus: "produced_artifact",
      lastLeadId: lead.id,
    });
  });

  it("does not let error runs reset cadence freshness", () => {
    const summary = deriveLoopObservability({
      definitions: [scheduled],
      leads: [lead],
      runs: [
        run({ id: "error", status: "error", started_at: "2026-06-25T12:00:00.000Z" }),
        run({ id: "old", started_at: "2026-06-01T12:00:00.000Z" }),
      ],
      now: new Date("2026-06-25T12:00:00.000Z"),
    })[scheduled.id];

    expect(summary?.state).toBe("due_now");
    expect(summary?.lastRunStatus).toBe("error");
  });

  it("separates paused and event-driven loops from scheduled health", () => {
    const eventDriven = { ...scheduled, id: "loop-event", cadence: undefined };
    const paused = { ...scheduled, id: "loop-paused", active: false };
    const summaries = deriveLoopObservability({
      definitions: [eventDriven, paused],
      leads: [lead],
      runs: [],
    });

    expect(summaries[eventDriven.id]?.state).toBe("event_driven");
    expect(summaries[paused.id]?.state).toBe("paused");
  });

  it("uses labels, addresses, and a fallback for recent run display", () => {
    expect(leadLabels([{ ...lead, label: "Ms. Carter" }, { ...lead, id: "lead-2", label: undefined }])).toEqual({
      "lead-1": "Ms. Carter",
      "lead-2": "22125 Clarksburg Road",
    });
    expect(leadLabels([{ ...lead, id: "lead-3", address: "" }])["lead-3"]).toBe("Unknown lead");
  });
});
