import { describe, expect, it } from "vitest";
import { DEMO_AGENT_ID } from "@/lib/core/config";
import { getRepo } from "@/lib/db";
import { emit } from "@/lib/pipeline";

describe("domain event idempotency", () => {
  it("deduplicates inbound events by tenant and idempotency key", async () => {
    const first = await emit(
      DEMO_AGENT_ID,
      "watcher.hit",
      { sourceId: "external-1" },
      "test",
      undefined,
      "external-1",
    );
    const second = await emit(
      DEMO_AGENT_ID,
      "watcher.hit",
      { sourceId: "external-1" },
      "test",
      undefined,
      "external-1",
    );
    expect(second.id).toBe(first.id);
    const events = await (await getRepo()).listEvents(DEMO_AGENT_ID);
    expect(events.filter((event) => event.idempotency_key === "external-1")).toHaveLength(1);
  });
});
