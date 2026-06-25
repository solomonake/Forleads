import { describe, expect, it } from "vitest";
import { FollowUpBossConnector } from "./followupboss";
import { GmailDraftConnector } from "./gmail";
import { GoHighLevelConnector } from "./gohighlevel";
import { MockConnector } from "./mock";
import { TwilioConnector } from "./twilio";
import { ZapierWebhookConnector } from "./zapier";

const meta = {
  idempotencyKey: "live-only-test",
  agentId: "00000000-0000-0000-0000-000000000002",
};

describe("live-only production connector policy", () => {
  it("fails closed instead of reporting a mock Gmail success", async () => {
    const result = await new GmailDraftConnector(undefined, false).createDraft(
      { from: "agent@example.com", to: "lead@example.com", subject: "Hello", body: "Hi" },
      meta,
    );
    expect(result).toMatchObject({ ok: false, provider: "google", mode: "mock" });
    expect(result.error).toContain("Google is not connected");
  });

  it.each([
    ["mock", new MockConnector("microsoft", false)],
    ["followupboss", new FollowUpBossConnector(undefined, undefined, false)],
    ["gohighlevel", new GoHighLevelConnector(undefined, undefined, undefined, false)],
    ["zapier", new ZapierWebhookConnector(undefined, false)],
  ])("%s write cannot fake success", async (_name, connector) => {
    const result = await connector.writeCrmNote({ body: "note", tags: [] }, meta);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not configured|credentials/i);
  });

  it("Twilio cannot fake an approved send", async () => {
    const result = await new TwilioConnector(undefined, undefined, undefined, false).sendSms(
      { to: "+15555550100", body: "hello" },
      meta,
    );
    expect(result).toMatchObject({ ok: false, provider: "twilio", mode: "mock" });
  });

  it("still permits deterministic mocks explicitly for local tests", async () => {
    const result = await new MockConnector("followupboss", true).writeCrmNote(
      { body: "note", tags: [] },
      { ...meta, idempotencyKey: "local-mock-test" },
    );
    expect(result).toMatchObject({ ok: true, mode: "mock" });
  });
});
