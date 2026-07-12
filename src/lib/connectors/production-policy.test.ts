import { afterEach, describe, expect, it, vi } from "vitest";

const env = process.env as Record<string, string | undefined>;
const KEYS = [
  "NODE_ENV",
  "FORLEADS_ALLOW_PRODUCTION_MOCKS",
  "GOOGLE_ACCESS_TOKEN",
  "FOLLOWUPBOSS_API_KEY",
  "GHL_API_KEY",
  "GHL_LOCATION_ID",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "ZAPIER_WEBHOOK_URL",
] as const;
const ORIG = Object.fromEntries(KEYS.map((key) => [key, env[key]]));

function unsetConnectorEnv() {
  for (const key of KEYS) delete env[key];
  env.NODE_ENV = "production";
}

function meta(idempotencyKey: string) {
  return {
    idempotencyKey,
    agentId: "00000000-0000-0000-0000-000000000002",
  };
}

async function productionConnectors() {
  vi.resetModules();
  unsetConnectorEnv();
  const connectors = await import("./index");
  connectors.resetIdempotencyLedger();
  return connectors;
}

afterEach(() => {
  for (const key of KEYS) {
    if (ORIG[key] === undefined) delete env[key];
    else env[key] = ORIG[key];
  }
  vi.resetModules();
});

describe("production connector factory policy", () => {
  it("disables mock success for email approvals without credentials", async () => {
    const { connectorForAction } = await productionConnectors();
    const connector = await connectorForAction("email");
    const result = await connector.createDraft(
      {
        from: "agent@example.com",
        to: "lead@example.com",
        subject: "Hello",
        body: "Hi",
      },
      meta("prod-email-no-creds"),
    );

    expect(result).toMatchObject({ ok: false, provider: "google", mode: "mock" });
    expect(result.error).toMatch(/not connected/i);
  });

  it("disables mock success for calendar approvals without credentials", async () => {
    const { connectorForAction } = await productionConnectors();
    const connector = await connectorForAction("calendar");
    const result = await connector.createCalendarEvent(
      {
        title: "Seller call",
        startAt: "2026-07-12T19:00:00.000Z",
        endAt: "2026-07-12T19:30:00.000Z",
        notes: "Discuss options.",
      },
      meta("prod-calendar-no-creds"),
    );

    expect(result).toMatchObject({ ok: false, provider: "google", mode: "mock" });
    expect(result.error).toMatch(/not connected/i);
  });

  it("disables mock success for SMS approvals without credentials", async () => {
    const { connectorForAction } = await productionConnectors();
    const connector = await connectorForAction("sms");
    expect(connector.sendSms).toBeTypeOf("function");
    const result = await connector.sendSms!(
      { to: "+15555550100", body: "hello" },
      meta("prod-sms-no-creds"),
    );

    expect(result).toMatchObject({ ok: false, provider: "twilio", mode: "mock" });
    expect(result.error).toMatch(/not configured/i);
  });

  it("disables mock success for CRM note and task approvals without credentials", async () => {
    const { connectorForAction } = await productionConnectors();
    const crm = await connectorForAction("crm_note");
    const task = await connectorForAction("task");

    const crmResult = await crm.writeCrmNote(
      { body: "note", tags: [] },
      meta("prod-crm-no-creds"),
    );
    const taskResult = await task.createTask(
      {
        title: "Follow up",
        dueAt: "2026-07-13T19:00:00.000Z",
        notes: "Call the owner.",
      },
      meta("prod-task-no-creds"),
    );

    expect(crmResult).toMatchObject({ ok: false, provider: "followupboss", mode: "mock" });
    expect(taskResult).toMatchObject({ ok: false, provider: "followupboss", mode: "mock" });
    expect(crmResult.error).toMatch(/not configured|credentials/i);
    expect(taskResult.error).toMatch(/not configured|credentials/i);
  });
});
