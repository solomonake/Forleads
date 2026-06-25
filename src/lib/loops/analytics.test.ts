import { describe, expect, it } from "vitest";
import type { Artifact, DomainEvent, LoopDefinition, LoopRun } from "@/lib/core/types";
import { deriveLoopAnalytics } from "./analytics";

describe("deriveLoopAnalytics", () => {
  it("derives metrics from immutable runs, artifacts, and events", () => {
    const definition = { id: "loop-1" } as LoopDefinition;
    const runs = [
      { id: "run-1", loop_definition_id: "loop-1", status: "produced_artifact" },
      { id: "run-2", loop_definition_id: "loop-1", status: "blocked_compliance" },
      { id: "run-3", loop_definition_id: "loop-1", status: "skipped_condition" },
    ] as LoopRun[];
    const artifacts = [
      { id: "artifact-1", loop_run_id: "run-1" },
    ] as Artifact[];
    const events = [
      { type: "artifact.approved", payload: { artifactId: "artifact-1" } },
      { type: "email.reply", payload: { loopRunId: "run-1" } },
    ] as unknown as DomainEvent[];

    expect(deriveLoopAnalytics({
      definitions: [definition],
      runs,
      artifacts,
      events,
    })["loop-1"]).toEqual({
      runs: 3,
      produced: 1,
      skipped: 1,
      blocked: 1,
      approved: 1,
      replies: 1,
    });
  });
});
