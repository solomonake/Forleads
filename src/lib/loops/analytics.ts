import type {
  Artifact,
  DomainEvent,
  LoopAnalytics,
  LoopDefinition,
  LoopRun,
} from "@/lib/core/types";

export function deriveLoopAnalytics(input: {
  definitions: LoopDefinition[];
  runs: LoopRun[];
  artifacts: Artifact[];
  events: DomainEvent[];
}): Record<string, LoopAnalytics> {
  const approvedArtifactIds = new Set(
    input.events
      .filter((event) => event.type === "artifact.approved")
      .map((event) => String(event.payload.artifactId ?? "")),
  );
  const repliesByRun = new Set(
    input.events
      .filter((event) => event.type === "email.reply")
      .map((event) => String(event.payload.loopRunId ?? "")),
  );
  const artifactsByRun = new Map<string, Artifact[]>();
  for (const artifact of input.artifacts) {
    if (!artifact.loop_run_id) continue;
    const list = artifactsByRun.get(artifact.loop_run_id) ?? [];
    list.push(artifact);
    artifactsByRun.set(artifact.loop_run_id, list);
  }

  return Object.fromEntries(
    input.definitions.map((definition) => {
      const runs = input.runs.filter(
        (run) => run.loop_definition_id === definition.id,
      );
      const artifacts = runs.flatMap((run) => artifactsByRun.get(run.id) ?? []);
      return [
        definition.id,
        {
          runs: runs.length,
          produced: runs.filter((run) => run.status === "produced_artifact").length,
          skipped: runs.filter((run) => run.status === "skipped_condition").length,
          blocked: runs.filter((run) => run.status === "blocked_compliance").length,
          approved: artifacts.filter((artifact) => approvedArtifactIds.has(artifact.id)).length,
          replies: runs.filter((run) => repliesByRun.has(run.id)).length,
        },
      ];
    }),
  );
}
