// ============================================================================
// GoogleCalendarConnector — real Calendar events.insert shape with OAuth/env
// hooks (docs/_ProductionMarketPlan_ §6, Calendar API). Drafts an appointment
// hold; gracefully mocks without a token.
// ============================================================================

import type { CalendarPayload, CrmNotePayload, EmailPayload, SmsPayload, TaskPayload } from "@/lib/core/types";
import { once } from "./idempotency";
import type { Connector, ConnectorResult, ConnectorWriteMeta, HealthStatus } from "./types";

const CALENDAR_API =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export class GoogleCalendarConnector implements Connector {
  readonly provider = "google" as const;
  readonly capabilities = ["createCalendarEvent"];
  readonly mode: "mock" | "live";
  constructor(private accessToken?: string) {
    this.mode = accessToken ? "live" : "mock";
  }

  async createCalendarEvent(payload: CalendarPayload, meta: ConnectorWriteMeta): Promise<ConnectorResult> {
    return once(meta.idempotencyKey, async () => {
      if (!this.accessToken) {
        return {
          ok: true,
          provider: "google",
          externalId: `gcal_mock_${meta.idempotencyKey}`,
          url: "https://calendar.google.com/calendar/u/0/r",
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "mock",
        };
      }
      const res = await fetch(CALENDAR_API, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: payload.title,
          description: payload.notes,
          start: { dateTime: payload.startAt },
          end: { dateTime: payload.endAt },
          // idempotency mapped to Calendar's own request id mechanism in prod.
          extendedProperties: { private: { forleadsKey: meta.idempotencyKey } },
        }),
      });
      const data = res.ok ? ((await res.json()) as { id: string; htmlLink?: string }) : null;
      return {
        ok: res.ok,
        provider: "google",
        externalId: data?.id,
        url: data?.htmlLink,
        idempotencyKey: meta.idempotencyKey,
        deduped: false,
        mode: "live",
        error: res.ok ? undefined : `calendar insert failed: ${res.status}`,
      };
    });
  }

  private no(meta: ConnectorWriteMeta, what: string): Promise<ConnectorResult> {
    return Promise.resolve({
      ok: false,
      provider: "google",
      idempotencyKey: meta.idempotencyKey,
      deduped: false,
      mode: this.mode,
      error: `${what} not supported by Calendar connector.`,
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
  writeCrmNote(_p: CrmNotePayload, m: ConnectorWriteMeta) {
    return this.no(m, "writeCrmNote");
  }
  sendSms(_p: SmsPayload, m: ConnectorWriteMeta) {
    return this.no(m, "sendSms");
  }
  async syncContacts() {
    return { imported: 0, mode: this.mode };
  }
  async healthCheck(): Promise<HealthStatus> {
    return {
      provider: "google",
      healthy: true,
      mode: this.mode,
      detail: this.accessToken ? "Connected — Calendar events." : "Mock mode — connect Google OAuth to go live.",
      capabilities: this.capabilities,
    };
  }
}
