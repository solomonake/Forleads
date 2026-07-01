import { emit } from "@/lib/pipeline";
import { log } from "@/lib/observability";

export async function emitApprovedAction(input: {
  agentId: string;
  artifactId: string;
  leadId?: string;
  loopId?: string;
}): Promise<void> {
  try {
    await emit(
      input.agentId,
      "northstar.action.approved",
      {
        artifactId: input.artifactId,
        ...(input.loopId ? { loopId: input.loopId } : {}),
      },
      "northstar",
      input.leadId,
      `northstar:approved:${input.artifactId}`,
    );
  } catch (error) {
    log("warn", "northstar.emit.failed", {
      agentId: input.agentId,
      artifactId: input.artifactId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
