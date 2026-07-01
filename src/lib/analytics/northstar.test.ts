import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_AGENT_ID } from "@/lib/core/config";
import { getRepo } from "@/lib/db";
import * as pipeline from "@/lib/pipeline";
import { emitApprovedAction } from "./northstar";

interface RepoGlobal {
  __forleadsRepo?: unknown;
  __forleadsSeeded?: unknown;
}

const g = globalThis as unknown as RepoGlobal;

beforeEach(() => {
  g.__forleadsRepo = undefined;
  g.__forleadsSeeded = undefined;
  vi.restoreAllMocks();
});

describe("emitApprovedAction", () => {
  it("deduplicates repeated approvals for the same artifact", async () => {
    await emitApprovedAction({ agentId: DEMO_AGENT_ID, artifactId: "artifact-1" });
    await emitApprovedAction({ agentId: DEMO_AGENT_ID, artifactId: "artifact-1" });

    const events = (await (await getRepo()).listEvents(DEMO_AGENT_ID)).filter(
      (event) => event.type === "northstar.action.approved",
    );
    expect(events).toHaveLength(1);
  });

  it("never throws when the event write fails", async () => {
    vi.spyOn(pipeline, "emit").mockRejectedValue(new Error("repo down"));
    await expect(
      emitApprovedAction({ agentId: DEMO_AGENT_ID, artifactId: "artifact-2" }),
    ).resolves.toBeUndefined();
  });
});
