// ============================================================================
// pipeline.recall.test.ts — recall observability.
//
// A silent recall is an unverifiable recall. The second tap of an address must
// emit a `memory.recalled` domain event so the Agent Trace surfaces it AND so
// prod logs prove the path fired. This test guards both.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { ensureLead, runSwarm } from "@/lib/pipeline";
import { getRepo } from "@/lib/db";
import { DEMO_AGENT_ID } from "@/lib/core/config";

interface RepoGlobal {
  __forleadsRepo?: unknown;
  __forleadsSeeded?: unknown;
  __forleadsCache?: unknown;
}

const g = globalThis as unknown as RepoGlobal;

beforeEach(() => {
  g.__forleadsRepo = undefined;
  g.__forleadsSeeded = undefined;
  g.__forleadsCache = undefined;
  delete process.env.OLLAMA_URL;
});

describe("runSwarm × recall observability", () => {
  it("emits memory.recalled on the second tap (and not the first)", async () => {
    const repo = await getRepo();
    const lead = await ensureLead(DEMO_AGENT_ID, {
      address: "42 Recall Lane",
      lng: -73.99,
      lat: 40.75,
    });

    // First tap — nothing to recall yet.
    await runSwarm(lead);
    const eventsAfterFirst = (await repo.listEvents(DEMO_AGENT_ID)).filter(
      (e) => e.type === "memory.recalled",
    );
    expect(eventsAfterFirst.length).toBe(0);

    // Second tap on the same lead — recall must fire.
    await runSwarm(lead);
    const eventsAfterSecond = (await repo.listEvents(DEMO_AGENT_ID)).filter(
      (e) => e.type === "memory.recalled",
    );
    expect(eventsAfterSecond.length).toBe(1);

    const evt = eventsAfterSecond[0]!;
    expect(evt.lead_surface_id).toBe(lead.id);
    expect(evt.source).toBe("memory");
    const payload = evt.payload as {
      hits: number;
      priorGrounded: number;
      sufficient: boolean;
      refs: string[];
    };
    expect(payload.hits).toBeGreaterThan(0);
    expect(payload.refs.length).toBe(payload.hits);
    expect(typeof payload.sufficient).toBe("boolean");
  });
});
