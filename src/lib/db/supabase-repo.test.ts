import { describe, expect, it } from "vitest";
import type { EvidenceCard } from "@/lib/core/types";
import { evidenceToRow } from "./supabase-repo";

describe("Supabase evidence mapping", () => {
  it("preserves stable card ids used by recalled-memory references", () => {
    const card: EvidenceCard = {
      id: "7f3aa297-7ca5-49c6-9199-a097597855f1",
      scout: "property",
      claim: "Year built",
      value: "1998",
      sources: [{ name: "county record" }],
      confidence: "A",
      created_at: "2026-06-25T08:00:00.000Z",
    };

    expect(evidenceToRow("04b64087-e0d7-4e57-8a53-c533859b85d0", card)).toMatchObject({
      id: card.id,
      lead_surface_id: "04b64087-e0d7-4e57-8a53-c533859b85d0",
      created_at: card.created_at,
    });
  });

  it("lets Postgres generate ids for legacy idless cards", () => {
    const row = evidenceToRow("lead-id", {
      scout: "market",
      claim: "Comparable sales",
      value: null,
      sources: [],
      confidence: "D",
    });

    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("created_at");
  });
});
