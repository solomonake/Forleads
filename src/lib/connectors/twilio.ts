// ============================================================================
// TwilioConnector — real Twilio Messages API shape for APPROVED SMS only.
// Respects opt-out/consent upstream; no auto-send (human gate). Mocks without
// credentials (docs/_ProductionMarketPlan_ §6/§10).
// ============================================================================

import type {
  CalendarPayload,
  CrmNotePayload,
  EmailPayload,
  SmsPayload,
  TaskPayload,
} from "@/lib/core/types";
import { once } from "./idempotency";
import type { Connector, ConnectorResult, ConnectorWriteMeta, HealthStatus } from "./types";

export class TwilioConnector implements Connector {
  readonly provider = "twilio" as const;
  readonly capabilities = ["sendSms"];
  readonly mode: "mock" | "live";
  constructor(
    private accountSid?: string,
    private authToken?: string,
    private fromNumber?: string
  ) {
    this.mode = accountSid && authToken && fromNumber ? "live" : "mock";
  }

  async sendSms(payload: SmsPayload, meta: ConnectorWriteMeta): Promise<ConnectorResult> {
    return once(meta.idempotencyKey, async () => {
      if (this.mode === "mock") {
        return {
          ok: true,
          provider: "twilio",
          externalId: `twilio_mock_${meta.idempotencyKey}`,
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "mock",
        };
      }
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
      const body = new URLSearchParams({
        To: payload.to,
        From: this.fromNumber!,
        Body: payload.body,
      });
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      const data = res.ok ? ((await res.json()) as { sid?: string }) : null;
      return {
        ok: res.ok,
        provider: "twilio",
        externalId: data?.sid,
        idempotencyKey: meta.idempotencyKey,
        deduped: false,
        mode: "live",
        error: res.ok ? undefined : `Twilio send failed: ${res.status}`,
      };
    });
  }

  private no(meta: ConnectorWriteMeta, what: string): Promise<ConnectorResult> {
    return Promise.resolve({
      ok: false,
      provider: "twilio",
      idempotencyKey: meta.idempotencyKey,
      deduped: false,
      mode: this.mode,
      error: `${what} not supported by Twilio connector.`,
    });
  }
  createDraft(_p: EmailPayload, m: ConnectorWriteMeta) {
    return this.no(m, "createDraft");
  }
  updateDraft(_id: string, _p: EmailPayload, m: ConnectorWriteMeta) {
    return this.no(m, "updateDraft");
  }
  createTask(_p: TaskPayload, m: ConnectorWriteMeta) {
    return this.no(m, "createTask");
  }
  createCalendarEvent(_p: CalendarPayload, m: ConnectorWriteMeta) {
    return this.no(m, "createCalendarEvent");
  }
  writeCrmNote(_p: CrmNotePayload, m: ConnectorWriteMeta) {
    return this.no(m, "writeCrmNote");
  }
  async syncContacts() {
    return { imported: 0, mode: this.mode };
  }
  async healthCheck(): Promise<HealthStatus> {
    return {
      provider: "twilio",
      healthy: this.mode === "live",
      mode: this.mode,
      detail: this.mode === "live" ? "Connected — SMS (approved sends only)." : "Needs setup — add Twilio SID/token/from number.",
      capabilities: this.capabilities,
    };
  }
}
