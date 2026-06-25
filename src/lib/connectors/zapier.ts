// ============================================================================
// ZapierWebhookConnector — bridge to unsupported CRMs and "Forleads as a
// platform". Posts the artifact payload to a configured webhook URL; the
// inbound endpoint (/api/connectors/zapier/inbound) lets external systems emit
// domain events into Forleads (docs/_ProductionMarketPlan_ §6).
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

export class ZapierWebhookConnector implements Connector {
  readonly provider = "zapier" as const;
  readonly capabilities = ["createTask", "writeCrmNote", "createCalendarEvent"];
  readonly mode: "mock" | "live";
  constructor(
    private webhookUrl?: string,
    private readonly mockWritesEnabled = true,
  ) {
    this.mode = webhookUrl ? "live" : "mock";
  }

  private async post(kind: string, payload: unknown, meta: ConnectorWriteMeta): Promise<ConnectorResult> {
    return once(meta.idempotencyKey, async () => {
      if (!this.webhookUrl) {
        if (!this.mockWritesEnabled) {
          return {
            ok: false,
            provider: "zapier",
            idempotencyKey: meta.idempotencyKey,
            deduped: false,
            mode: "mock",
            error: "Zapier is not configured. Add ZAPIER_WEBHOOK_URL.",
          };
        }
        return {
          ok: true,
          provider: "zapier",
          externalId: `zap_mock_${kind}_${meta.idempotencyKey}`,
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "mock",
        };
      }
      const res = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Idempotency-Key": meta.idempotencyKey },
        body: JSON.stringify({ kind, payload, meta }),
      });
      return {
        ok: res.ok,
        provider: "zapier",
        idempotencyKey: meta.idempotencyKey,
        deduped: false,
        mode: "live",
        error: res.ok ? undefined : `Zapier webhook failed: ${res.status}`,
      };
    });
  }

  createTask(p: TaskPayload, m: ConnectorWriteMeta) {
    return this.post("task", p, m);
  }
  writeCrmNote(p: CrmNotePayload, m: ConnectorWriteMeta) {
    return this.post("crm_note", p, m);
  }
  createCalendarEvent(p: CalendarPayload, m: ConnectorWriteMeta) {
    return this.post("calendar", p, m);
  }
  createDraft(p: EmailPayload, m: ConnectorWriteMeta) {
    return this.post("email_draft", p, m);
  }
  updateDraft(externalId: string, p: EmailPayload, m: ConnectorWriteMeta) {
    return this.post("email_draft_update", { externalId, ...p }, m);
  }
  sendSms(p: SmsPayload, m: ConnectorWriteMeta) {
    return this.post("sms", p, m);
  }
  async syncContacts() {
    return { imported: 0, mode: this.mode };
  }
  async healthCheck(): Promise<HealthStatus> {
    return {
      provider: "zapier",
      healthy: Boolean(this.webhookUrl) || this.mockWritesEnabled,
      mode: this.mode,
      detail: this.webhookUrl
        ? "Connected — posting to your Zap."
        : this.mockWritesEnabled
          ? "Local mock mode — paste a Zapier Catch Hook URL to go live."
          : "Setup required — add ZAPIER_WEBHOOK_URL; production mock writes are disabled.",
      capabilities: this.capabilities,
    };
  }
}
