import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRepo } from "@/lib/db";
import { resetIdempotencyLedger } from "@/lib/connectors/idempotency";

interface RepoGlobal {
  __forleadsRepo?: unknown;
  __forleadsSeeded?: unknown;
}

const g = globalThis as unknown as RepoGlobal;

beforeEach(() => {
  g.__forleadsRepo = undefined;
  g.__forleadsSeeded = undefined;
  resetIdempotencyLedger();
  vi.restoreAllMocks();
  vi.resetModules();
  delete process.env.WELCOME_EMAIL_ENABLED;
});

describe("sendWelcomeEmail", () => {
  it("sends exactly one welcome draft for the same agent", async () => {
    process.env.WELCOME_EMAIL_ENABLED = "1";
    const connectorModule = await import("@/lib/connectors/gmail");
    const draftSpy = vi.spyOn(
      connectorModule.GmailDraftConnector.prototype,
      "createDraft",
    ).mockResolvedValue({
      ok: true,
      provider: "google",
      externalId: "draft-1",
      url: "https://mail.google.com/mail/u/0/#drafts",
      idempotencyKey: "welcome:sent:agent-1",
      deduped: false,
      mode: "live",
    });
    const { sendWelcomeEmail } = await import("./welcome");

    await sendWelcomeEmail({
      agentId: "agent-1",
      email: "agent@example.com",
      name: "Agent One",
      accessToken: "token",
    });
    await sendWelcomeEmail({
      agentId: "agent-1",
      email: "agent@example.com",
      name: "Agent One",
      accessToken: "token",
    });

    expect(draftSpy).toHaveBeenCalledTimes(1);
    const events = (await (await getRepo()).listEvents("agent-1")).filter(
      (event) => event.type === "welcome.sent",
    );
    expect(events).toHaveLength(1);
  });

  it("fails closed when no access token is available", async () => {
    process.env.WELCOME_EMAIL_ENABLED = "1";
    const connectorModule = await import("@/lib/connectors/gmail");
    const draftSpy = vi.spyOn(connectorModule.GmailDraftConnector.prototype, "createDraft");
    const { sendWelcomeEmail } = await import("./welcome");

    await sendWelcomeEmail({
      agentId: "agent-2",
      email: "agent@example.com",
      name: "Agent Two",
    });

    expect(draftSpy).not.toHaveBeenCalled();
    const events = (await (await getRepo()).listEvents("agent-2")).filter(
      (event) => event.type === "welcome.skipped",
    );
    expect(events).toHaveLength(1);
  });
});
