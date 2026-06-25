// Friday-safety regression: the missing 0005_memories migration in prod was
// causing fl_recall_memories schema-cache misses to 500 every lead tap. The
// memory layer must DEGRADE gracefully — recall returns empty, persist returns
// null — so a schema gap or transient Supabase outage never blocks the loop.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Force a thrown failure inside the repo for these tests. The repo factory
// reads the singleton from globalThis, so we install a poisoned repo that
// throws for the memory methods we want to fail.
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

afterEach(() => {
  vi.restoreAllMocks();
});

function poison(method: "recallMemories" | "recallNeighborhood" | "saveMemory") {
  g.__forleadsRepo = {
    recallMemories: vi.fn().mockRejectedValue(new Error("simulated: function does not exist")),
    recallNeighborhood: vi.fn().mockRejectedValue(new Error("simulated: table missing")),
    saveMemory: vi.fn().mockRejectedValue(new Error("simulated: insert blocked")),
    // Stubs for anything else recallForLead transitively touches via the embedder.
  };
  // method param is illustrative — all three are stubbed to reject; the test
  // names which path it exercises.
  return method;
}

describe("memory degrades gracefully when the store throws", () => {
  it("recallForLead returns an empty summary instead of 500ing the swarm", async () => {
    poison("recallMemories");
    const { recallForLead } = await import("./memory");
    const lead = {
      id: "lead-1",
      agent_id: "agent-1",
      address: "1 Test St",
      lng: 0,
      lat: 0,
      status: "new",
    } as Parameters<typeof recallForLead>[0];
    const r = await recallForLead(lead, "1 Test St");
    expect(r.hits).toEqual([]);
    expect(r.refs).toEqual([]);
    expect(r.priorGroundedCount).toBe(0);
    expect(r.sufficient).toBe(false);
  });

  it("recallNeighborhood returns [] instead of throwing", async () => {
    poison("recallNeighborhood");
    const { recallNeighborhood } = await import("./memory");
    const hits = await recallNeighborhood("agent-1", "8a2a1072b59ffff", 16);
    expect(hits).toEqual([]);
  });

  it("persistEvidenceMemory returns null instead of throwing", async () => {
    poison("saveMemory");
    const { persistEvidenceMemory } = await import("./memory");
    const lead = { id: "lead-1", agent_id: "agent-1" } as Parameters<typeof persistEvidenceMemory>[1];
    const card = {
      id: "card-1",
      scout: "property",
      claim: "year_built",
      value: 1990,
      confidence: "B",
      sources: [],
    } as unknown as Parameters<typeof persistEvidenceMemory>[2];
    const result = await persistEvidenceMemory("agent-1", lead, card);
    expect(result).toBeNull();
  });
});
