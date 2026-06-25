// ============================================================================
// pipeline.recalled-hits.test.ts — ReduceSummary.recalledHits is the
// projection the lead rail expands into the "N prior signals" chip. Verifies
// the field is undefined on the first tap (no prior memory) and populated on
// the second with a UI-safe shape (no embedding vector, sorted newest-first).
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { ensureLead, runSwarm } from "@/lib/pipeline";
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

describe("ReduceSummary.recalledHits (PR #14 q6 follow-up)", () => {
  it("is undefined on the first tap, populated on the second", async () => {
    const lead = await ensureLead(DEMO_AGENT_ID, {
      address: "9 Followup Way",
      lng: -73.97,
      lat: 40.76,
    });

    const first = await runSwarm(lead);
    expect(first.summary.recalledHits).toBeUndefined();

    const second = await runSwarm(lead);
    expect(second.summary.recalledHits).toBeDefined();
    expect(second.summary.recalledHits!.length).toBeGreaterThan(0);

    // Shape — no embedding, expected fields present.
    for (const h of second.summary.recalledHits!) {
      expect(typeof h.memoryId).toBe("string");
      expect(["evidence", "note", "event"]).toContain(h.kind);
      expect(typeof h.text).toBe("string");
      expect(typeof h.createdAt).toBe("string");
      // No embedding vector leaks through.
      expect("embedding" in h).toBe(false);
    }

    // Sorted newest-first.
    const dates = second.summary.recalledHits!.map((h) => h.createdAt);
    const sorted = [...dates].sort((a, b) => (a < b ? 1 : -1));
    expect(dates).toEqual(sorted);
  });

  it("sets the matching evidence ref so the rail can jump to the card", async () => {
    const lead = await ensureLead(DEMO_AGENT_ID, {
      address: "12 Jump Court",
      lng: -73.99,
      lat: 40.74,
    });
    await runSwarm(lead);
    const second = await runSwarm(lead);

    const evidenceHits = (second.summary.recalledHits ?? []).filter(
      (h) => h.kind === "evidence",
    );
    expect(evidenceHits.length).toBeGreaterThan(0);
    // Every evidence hit should carry a ref pointing at the original card id.
    for (const h of evidenceHits) {
      expect(typeof h.ref).toBe("string");
      expect((h.ref ?? "").length).toBeGreaterThan(0);
    }
  });
});
