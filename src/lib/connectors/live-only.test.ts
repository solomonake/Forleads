import { beforeEach, describe, expect, it } from "vitest";
import { GoogleCalendarConnector } from "./calendar";
import { FollowUpBossConnector } from "./followupboss";
import { GmailDraftConnector } from "./gmail";
import { GoHighLevelConnector } from "./gohighlevel";
import { MockConnector } from "./mock";
import { OutlookDraftConnector } from "./outlook";
import { TwilioConnector } from "./twilio";
import { ZapierWebhookConnector } from "./zapier";
import { resetIdempotencyLedger } from "./idempotency";

function meta(idempotencyKey: string) {
  return {
    idempotencyKey,
    agentId: "00000000-0000-0000-0000-000000000002",
  };
}

const calendarPayload = {
  title: "Seller call",
  startAt: "2026-07-12T19:00:00.000Z",
  endAt: "2026-07-12T19:30:00.000Z",
  notes: "Discuss options.",
};

const emailPayload = {
  from: "agent@example.com",
  to: "lead@example.com",
  subject: "Hello",
  body: "Hi",
};

const smsPayload = {
  to: "+15555550100",
  body: "hello",
};

const crmPayload = {
  body: "note",
  tags: [],
};

describe("live-only production connector policy", () => {
  beforeEach(() => {
    resetIdempotencyLedger();
  });

  it("fails closed instead of reporting a mock Gmail success", async () => {
    const result = await new GmailDraftConnector(undefined, false).createDraft(
      emailPayload,
      meta("gmail-live-only-test"),
    );
    expect(result).toMatchObject({ ok: false, provider: "google", mode: "mock" });
    expect(result.error).toContain("Google is not connected");
  });

  it("fails closed instead of reporting a mock Google Calendar success", async () => {
    const result = await new GoogleCalendarConnector(undefined, false).createCalendarEvent(
      calendarPayload,
      meta("google-calendar-live-only-test"),
    );
    expect(result).toMatchObject({ ok: false, provider: "google", mode: "mock" });
    expect(result.error).toContain("Google is not connected");
  });

  it("fails closed instead of reporting a mock Outlook draft success", async () => {
    const result = await new OutlookDraftConnector(undefined, false).createDraft(
      emailPayload,
      meta("outlook-draft-live-only-test"),
    );
    expect(result).toMatchObject({ ok: false, provider: "microsoft", mode: "mock" });
    expect(result.error).toContain("Microsoft is not connected");
  });

  it("fails closed instead of reporting a mock Outlook calendar success", async () => {
    const result = await new OutlookDraftConnector(undefined, false).createCalendarEvent(
      calendarPayload,
      meta("outlook-calendar-live-only-test"),
    );
    expect(result).toMatchObject({ ok: false, provider: "microsoft", mode: "mock" });
    expect(result.error).toContain("Microsoft is not connected");
  });

  it.each([
    ["mock", new MockConnector("microsoft", false), "mock-live-only-test"],
    ["followupboss", new FollowUpBossConnector(undefined, undefined, false), "fub-live-only-test"],
    ["gohighlevel", new GoHighLevelConnector(undefined, undefined, undefined, false), "ghl-live-only-test"],
    ["zapier", new ZapierWebhookConnector(undefined, false), "zapier-live-only-test"],
  ])("%s write cannot fake success", async (_name, connector, key) => {
    const result = await connector.writeCrmNote(crmPayload, meta(key));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not configured|credentials/i);
  });

  it("Twilio cannot fake an approved send", async () => {
    const result = await new TwilioConnector(undefined, undefined, undefined, false).sendSms(
      smsPayload,
      meta("twilio-live-only-test"),
    );
    expect(result).toMatchObject({ ok: false, provider: "twilio", mode: "mock" });
  });

  it("still permits deterministic mocks explicitly for local tests", async () => {
    const result = await new MockConnector("followupboss", true).writeCrmNote(
      crmPayload,
      meta("local-mock-test"),
    );
    expect(result).toMatchObject({ ok: true, mode: "mock" });
  });
});
