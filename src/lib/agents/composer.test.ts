import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Agent, EvidenceCard } from "@/lib/core/types";
import type { ComposeInput, ComposeOutput } from "./composer";

// Force live mode on, regardless of env, so composeBest takes the Claude path.
vi.mock("@/lib/core/config", async (orig) => {
  const actual = await orig<typeof import("@/lib/core/config")>();
  return { ...actual, claudeLive: () => true };
});

// Mock the ONE Anthropic seam with a PLAIN function (not vi.fn): a vi.fn whose
// implementation rejects leaves an unhandled-rejection in vitest's result
// tracking even when the caller handles it. A plain function dodges that while
// still letting us steer behavior and count calls.
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

import { composeBest } from "./composer";

const agent = {
  id: "a1",
  name: "Sam Rivera",
  email: "sam@example.com",
  brandVoice: "warm_local",
  signatureHtml: "<p>Sam</p>",
} as unknown as Agent;

const card = {
  scout: "structure",
  claim: "Building footprint ~ 180 m²",
  value: "180 m²",
  sources: [{ name: "OSM", url: "https://osm.org" }],
  confidence: "B",
} as unknown as EvidenceCard;

function input(overrides: Partial<ComposeInput> = {}): ComposeInput {
  return {
    agent,
    situation: "interested_seller",
    actionType: "email",
    address: "12 Oak St",
    recipientLabel: "Owner · 12 Oak St",
    recipientEmail: "owner@example.com",
    evidence: [card],
    ...overrides,
  };
}

describe("composeBest — live Claude with total fallback", () => {
  beforeEach(() => {
    claude.calls = 0;
    claude.impl = async () => ({});
  });

  it("falls back to the deterministic template when the client throws", async () => {
    claude.impl = async () => {
      throw new Error("network down");
    };
    const out = await composeBest(input());
    expect(out.promptVersion).toBe("composer-1.2.0"); // template, not live
    expect((out.payload as { subject: string }).subject).toContain("12 Oak St");
  });

  it("falls back when the model returns an empty draft", async () => {
    claude.impl = async () => ({ subject: "", body: "   " });
    const out = await composeBest(input());
    expect(out.promptVersion).toBe("composer-1.2.0");
  });

  it("uses the live draft when the model returns valid JSON", async () => {
    claude.impl = async () => ({
      subject: "A quick, honest note on 12 Oak St",
      body: "Hi there,\n\nNo pressure at all — happy to share what I'm seeing.\n\nWarmly,\nSam Rivera",
    });
    const out: ComposeOutput = await composeBest(input());
    expect(out.promptVersion).toBe("composer-live-1.0.0");
    const p = out.payload as { subject: string; body: string };
    expect(p.subject).toBe("A quick, honest note on 12 Oak St");
    expect(p.body).toContain("Sam Rivera");
  });

  it("still strips protected-class content from live output (defense in depth)", async () => {
    claude.impl = async () => ({
      subject: "About your home",
      body: "I noticed the kids' bikes out front — lovely street. Warmly, Sam",
    });
    const out = await composeBest(input());
    expect(out.promptVersion).toBe("composer-live-1.0.0");
    expect(out.excluded.length).toBeGreaterThan(0);
    expect((out.payload as { body: string }).body).not.toMatch(/kids'? bikes?/i);
  });

  it("does not call Claude for non-text actions, even in live mode", async () => {
    const out = await composeBest(input({ actionType: "task" }));
    expect(claude.calls).toBe(0);
    expect(out.promptVersion).toBe("composer-1.2.0");
  });
});
