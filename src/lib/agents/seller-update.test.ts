import { describe, expect, it } from "vitest";
import type { Note } from "@/lib/core/types";
import { summarizeShowingFeedback } from "./seller-update";

const now = new Date("2026-06-30T12:00:00.000Z");

function note(id: string, body: string, daysAgo = 1): Note {
  return {
    id,
    agent_id: "agent-1",
    lead_surface_id: "lead-1",
    body,
    modality: "text",
    created_at: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
  };
}

describe("summarizeShowingFeedback", () => {
  it("ranks repeated buyer-feedback themes and keeps supporting note ids", () => {
    const summary = summarizeShowingFeedback(
      [
        note("n1", "Buyer said the price felt high and the kitchen looked dated."),
        note("n2", "Second showing thought price seemed too high."),
        note("n3", "They liked it but felt the kitchen was dated."),
      ],
      { now },
    );

    expect(summary.showingsCounted).toBe(3);
    expect(summary.themes.map((theme) => theme.kind)).toEqual(["volume", "price", "condition"]);
    expect(summary.themes.find((theme) => theme.kind === "price")).toMatchObject({
      mentions: 2,
      confidence: "B",
      supportingNoteIds: ["n1", "n2"],
    });
  });

  it("returns an empty theme list for empty notes", () => {
    const summary = summarizeShowingFeedback([], { now });
    expect(summary.themes).toEqual([]);
    expect(summary.showingsCounted).toBe(0);
  });

  it("does not ship single-source themes", () => {
    const summary = summarizeShowingFeedback([note("n1", "The kitchen felt dated.")], { now });
    expect(summary.themes).toEqual([]);
    expect(summary.droppedThemeCount).toBe(1);
  });

  it("requires at least two independent notes before surfacing a price signal", () => {
    const summary = summarizeShowingFeedback(
      [note("n1", "Price felt high."), note("n2", "Loved the light.")],
      { now },
    );
    expect(summary.themes.some((theme) => theme.kind === "price")).toBe(false);
    expect(summary.themes.some((theme) => theme.kind === "volume")).toBe(true);
  });

  it("excludes opt-out notes from themes", () => {
    const summary = summarizeShowingFeedback(
      [
        note("n1", "Do not contact me. Price feels high."),
        note("n2", "Price felt high."),
        note("n3", "Price seemed too high."),
      ],
      { now },
    );
    expect(summary.excludedNoteIds).toEqual(["n1"]);
    expect(summary.themes.find((theme) => theme.kind === "price")?.supportingNoteIds).toEqual(["n2", "n3"]);
  });

  it("drops notes outside the requested window", () => {
    const summary = summarizeShowingFeedback(
      [
        note("n1", "Price felt high.", 1),
        note("n2", "Price seemed too high.", 15),
        note("n3", "The kitchen felt dated.", 2),
        note("n4", "The bath looked dated.", 3),
      ],
      { now, windowDays: 14 },
    );
    expect(summary.noteIds).not.toContain("n2");
    expect(summary.themes.some((theme) => theme.kind === "price")).toBe(false);
    expect(summary.themes.some((theme) => theme.kind === "condition")).toBe(true);
  });
});
