// ============================================================================
// memory.test.ts — lead-scoped recall reduces scout calls on the second tap.
//
// Mirrors the scouts.cache.test.ts pattern: reset the repo singleton between
// cases so each test sees a fresh in-memory store. With the deterministic mock
// embedder, identical query text yields identical vectors (cosine = 1.0), so
// recall semantics are testable without Ollama.
// ============================================================================

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planDispatch } from "./dispatcher";
import {
  persistEvidenceMemory,
  recallForLead,
  renderRecallNote,
  SUFFICIENT_PRIOR_GROUNDED,
} from "./memory";
import { cosineSimilarity, getEmbedder } from "./embedder";
import { nowISO, uuid } from "@/lib/core/ids";
import { h3Key } from "@/lib/core/geo";
import type { EvidenceCard, LeadSurface } from "@/lib/core/types";

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
  // Force fetch-disabled so the embedder takes the mock path deterministically
  // (the real Ollama URL would never be reachable in CI anyway, but this is
  // belt + suspenders for local dev where Ollama might be running).
  delete process.env.OLLAMA_URL;
});

afterEach(() => {
  g.__forleadsRepo = undefined;
  g.__forleadsSeeded = undefined;
});

function makeLead(): LeadSurface {
  const lng = -73.985;
  const lat = 40.748;
  return {
    id: uuid(),
    agent_id: "00000000-0000-0000-0000-000000000001",
    lng,
    lat,
    address: "1 Test St",
    locality: "Testville",
    h3_index: h3Key(lng, lat),
    status: "researching",
    first_seen_at: nowISO(),
    last_worked_at: nowISO(),
  };
}

function gradedCard(confidence: EvidenceCard["confidence"]): EvidenceCard {
  return {
    id: uuid(),
    scout: "property",
    claim: "Building footprint",
    value: "180 m²",
    sources: [{ name: "OpenStreetMap" }],
    confidence,
    created_at: nowISO(),
  };
}

describe("embedder (mock fallback)", () => {
  it("is deterministic — same text yields cosine ~1.0", async () => {
    const e = getEmbedder();
    const a = await e.embed("Building footprint ~180 m²");
    const b = await e.embed("Building footprint ~180 m²");
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it("L2-normalizes — independent text yields cosine < 1", async () => {
    const e = getEmbedder();
    const a = await e.embed("Building footprint 180 m²");
    const b = await e.embed("Flood risk Low");
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeLessThan(0.5);
  });
});

describe("recallForLead", () => {
  it("returns no hits before anything has been written", async () => {
    const lead = makeLead();
    const r = await recallForLead(lead, lead.address);
    expect(r.hits.length).toBe(0);
    expect(r.sufficient).toBe(false);
  });

  it("marks recall sufficient once >= SUFFICIENT_PRIOR_GROUNDED A/B cards are persisted", async () => {
    const lead = makeLead();
    for (let i = 0; i < SUFFICIENT_PRIOR_GROUNDED; i++) {
      await persistEvidenceMemory(lead.agent_id, lead, gradedCard("B"));
    }
    const r = await recallForLead(lead, lead.address);
    expect(r.priorGroundedCount).toBeGreaterThanOrEqual(SUFFICIENT_PRIOR_GROUNDED);
    expect(r.sufficient).toBe(true);
  });

  it("does NOT mark recall sufficient when prior cards are only C/D-graded", async () => {
    const lead = makeLead();
    await persistEvidenceMemory(lead.agent_id, lead, gradedCard("C"));
    await persistEvidenceMemory(lead.agent_id, lead, gradedCard("D"));
    const r = await recallForLead(lead, lead.address);
    expect(r.priorGroundedCount).toBe(0);
    expect(r.sufficient).toBe(false);
  });
});

describe("dispatcher × memory", () => {
  it("drops the property scout when prior recall is sufficient", async () => {
    const lead = makeLead();
    const planFresh = await planDispatch({
      lng: lead.lng,
      lat: lead.lat,
      address: lead.address,
      status: lead.status,
    });
    const fresh = planFresh.scouts.map((s) => s.type);
    expect(fresh).toContain("property");

    const planRecalled = await planDispatch({
      lng: lead.lng,
      lat: lead.lat,
      address: lead.address,
      status: lead.status,
      priorGroundedCount: SUFFICIENT_PRIOR_GROUNDED,
    });
    const recalled = planRecalled.scouts.map((s) => s.type);
    expect(recalled).not.toContain("property");
    // Other scouts must still run — recall only shortcuts what was grounded.
    expect(recalled).toContain("imagery");
    expect(recalled).toContain("risk");
    expect(planRecalled.notes.some((n) => /Skipping property scout/i.test(n))).toBe(true);
  });
});

describe("renderRecallNote (FOMO copy)", () => {
  it("returns null when nothing was recalled (no fake signal)", () => {
    expect(renderRecallNote({ hits: [], refs: [], priorGroundedCount: 0, sufficient: false })).toBeNull();
  });

  it("renders a shortcut-style line when recall is sufficient", () => {
    const note = renderRecallNote({
      hits: [{} as never, {} as never, {} as never],
      refs: ["a", "b", "c"],
      priorGroundedCount: 3,
      sufficient: true,
    });
    expect(note).toMatch(/skipping fresh property research/i);
    expect(note).toMatch(/3 fact/);
  });

  it("renders an honest 'no shortcut' line when hits exist but are not sufficient", () => {
    const note = renderRecallNote({
      hits: [{} as never],
      refs: ["a"],
      priorGroundedCount: 0,
      sufficient: false,
    });
    expect(note).toMatch(/no shortcut taken/i);
  });
});
