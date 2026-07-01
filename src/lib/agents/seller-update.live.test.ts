import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent, EvidenceCard } from "@/lib/core/types";
import type { ComposeInput } from "./composer";
import type { SellerUpdateTheme } from "./seller-update";

const live = { enabled: true };

vi.mock("@/lib/core/config", async (orig) => {
  const actual = await orig<typeof import("@/lib/core/config")>();
  return { ...actual, claudeLive: () => live.enabled };
});

const claude: { calls: number; impl: (input: unknown) => Promise<unknown> } = {
  calls: 0,
  impl: async () => ({}),
};

vi.mock("@/lib/agents/claude", () => ({
  claudeJSON: (input: unknown) => {
    claude.calls += 1;
    return claude.impl(input);
  },
  ClaudeError: class ClaudeError extends Error {},
}));

import { composeSellerUpdateBest } from "./seller-update.live";

const agent = {
  id: "agent-1",
  name: "Sam Rivera",
  email: "sam@example.com",
  brandVoice: "warm_local",
  signatureHtml: "<p>Sam</p>",
} as unknown as Agent;

const theme: SellerUpdateTheme = {
  kind: "price",
  label: "Pricing feedback",
  mentions: 3,
  supportingNoteIds: ["n1", "n2", "n3"],
  confidence: "A",
};

const evidence = {
  scout: "market",
  claim: "Pricing feedback buyer-feedback theme",
  value: "3 of 4 in-window showing notes",
  sources: [{ name: "Showing feedback note n1", url: "note://n1" }],
  confidence: "A",
} as EvidenceCard;

function input(): ComposeInput {
  return {
    agent,
    situation: "interested_seller",
    actionType: "email",
    address: "12 Oak St",
    recipientLabel: "Pat Seller",
    recipientEmail: "pat@example.com",
    evidence: [evidence],
    sellerUpdate: {
      themes: [theme],
      showingsCounted: 4,
      windowDays: 14,
      noteIds: ["n1", "n2", "n3", "n4"],
    },
  };
}

describe("composeSellerUpdateBest", () => {
  beforeEach(() => {
    live.enabled = true;
    claude.calls = 0;
    claude.impl = async () => ({});
  });

  it("falls back to the deterministic seller-update draft when Claude throws", async () => {
    claude.impl = async () => {
      throw new Error("network down");
    };
    const out = await composeSellerUpdateBest(input());
    expect(out.promptVersion).toBe("composer-1.2.0");
    expect(out.fallbackReason).toBe("network down");
    expect((out.payload as { subject: string }).subject).toContain("showings for 12 Oak St");
  });

  it("throws through the live path and falls back when the model returns empty text", async () => {
    claude.impl = async () => ({ subject: "", body: "   " });
    const out = await composeSellerUpdateBest(input());
    expect(out.promptVersion).toBe("composer-1.2.0");
    expect(out.fallbackReason).toContain("empty email");
  });

  it("uses valid live prose while preserving deterministic evidence", async () => {
    claude.impl = async () => ({
      subject: "Showing feedback for 12 Oak St",
      body: "Hi Pat,\n\nRecent feedback has been consistent around pricing. I will keep watching the next round closely.\n\nWarmly,\nSam",
    });
    const out = await composeSellerUpdateBest(input());
    expect(out.promptVersion).toBe("seller-update-live-1.0.0");
    expect(out.evidenceUsed).toEqual([evidence]);
    expect((out.payload as { body: string }).body).toContain("Recent feedback");
  });
});
