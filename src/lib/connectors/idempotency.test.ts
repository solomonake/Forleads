import { describe, it, expect, beforeEach } from "vitest";
import { MockConnector } from "./mock";
import { resetIdempotencyLedger } from "./idempotency";
import { GmailDraftConnector } from "./gmail";
import { idempotencyKey } from "@/lib/core/ids";
import type { EmailPayload } from "@/lib/core/types";

const email: EmailPayload = {
  from: "Marcus <marcus@forleads.app>",
  to: "owner@example.com",
  subject: "A quick note",
  body: "Hi there, hope you're well.",
};

describe("connector idempotency", () => {
  beforeEach(() => resetIdempotencyLedger());

  it("does not duplicate a write on retry (mock)", async () => {
    const c = new MockConnector("google");
    const meta = { idempotencyKey: "idem_test_1", agentId: "a" };
    const first = await c.createDraft(email, meta);
    const second = await c.createDraft(email, meta);
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(second.externalId).toBe(first.externalId);
  });

  it("treats different keys as distinct writes", async () => {
    const c = new MockConnector("google");
    const a = await c.createDraft(email, { idempotencyKey: "k1", agentId: "a" });
    const b = await c.createDraft(email, { idempotencyKey: "k2", agentId: "a" });
    expect(a.externalId).not.toBe(b.externalId);
    expect(b.deduped).toBe(false);
  });

  it("Gmail connector mock-falls back and is idempotent", async () => {
    const c = new GmailDraftConnector(); // no token → mock
    const meta = { idempotencyKey: "gmail_k", agentId: "a" };
    const first = await c.createDraft(email, meta);
    const second = await c.createDraft(email, meta);
    expect(first.mode).toBe("mock");
    expect(first.ok).toBe(true);
    expect(second.deduped).toBe(true);
  });

  it("idempotencyKey is deterministic for the same logical action", () => {
    const k1 = idempotencyKey(["artifact-1", "email", "google"]);
    const k2 = idempotencyKey(["artifact-1", "email", "google"]);
    const k3 = idempotencyKey(["artifact-2", "email", "google"]);
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });
});
