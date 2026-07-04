// ============================================================================
// OutlookDraftConnector — real Microsoft Graph shape for Outlook drafts and
// Calendar events. Scope is minimal: Mail.ReadWrite (drafts only, never
// Mail.Send) + Calendars.ReadWrite. Falls back to a labeled mock without a
// token so the flow still runs in dev.
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

const GRAPH = "https://graph.microsoft.com/v1.0";

export class OutlookDraftConnector implements Connector {
  readonly provider = "microsoft" as const;
  readonly capabilities = ["createDraft", "updateDraft", "createCalendarEvent"];
  readonly mode: "mock" | "live";

  constructor(
    private accessToken?: string,
    private readonly mockWritesEnabled = true,
  ) {
    this.mode = accessToken ? "live" : "mock";
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };
  }

  async createDraft(payload: EmailPayload, meta: ConnectorWriteMeta): Promise<ConnectorResult> {
    return once(meta.idempotencyKey, async () => {
      if (!this.accessToken) {
        if (!this.mockWritesEnabled) {
          return {
            ok: false,
            provider: "microsoft",
            idempotencyKey: meta.idempotencyKey,
            deduped: false,
            mode: "mock",
            error: "Microsoft is not connected. Complete Microsoft OAuth before approving an email draft.",
          };
        }
        return {
          ok: true,
          provider: "microsoft",
          externalId: `outlook_mock_${meta.idempotencyKey}`,
          url: "https://outlook.office.com/mail/drafts",
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "mock",
        };
      }
      // Graph POST /me/messages creates a draft; the payload maps to the
      // Message resource. isDraft defaults to true when using this endpoint.
      const body = {
        subject: payload.subject,
        body: { contentType: "Text", content: payload.body },
        toRecipients: [{ emailAddress: { address: payload.to } }],
      };
      try {
        const res = await fetch(`${GRAPH}/me/messages`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          return {
            ok: false,
            provider: "microsoft",
            idempotencyKey: meta.idempotencyKey,
            deduped: false,
            mode: "live",
            error: `Outlook draft failed: ${res.status}`,
          };
        }
        const data = (await res.json()) as { id: string; webLink?: string };
        return {
          ok: true,
          provider: "microsoft",
          externalId: data.id,
          url: data.webLink ?? "https://outlook.office.com/mail/drafts",
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "live",
        };
      } catch (e) {
        return {
          ok: false,
          provider: "microsoft",
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "live",
          error: e instanceof Error ? e.message : "network error",
        };
      }
    });
  }

  async updateDraft(
    externalId: string,
    payload: EmailPayload,
    meta: ConnectorWriteMeta,
  ): Promise<ConnectorResult> {
    return once(meta.idempotencyKey, async () => {
      if (!this.accessToken) {
        if (!this.mockWritesEnabled) {
          return {
            ok: false,
            provider: "microsoft",
            idempotencyKey: meta.idempotencyKey,
            deduped: false,
            mode: "mock",
            error: "Microsoft is not connected.",
          };
        }
        return {
          ok: true,
          provider: "microsoft",
          externalId,
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "mock",
        };
      }
      const res = await fetch(`${GRAPH}/me/messages/${encodeURIComponent(externalId)}`, {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify({
          subject: payload.subject,
          body: { contentType: "Text", content: payload.body },
          toRecipients: [{ emailAddress: { address: payload.to } }],
        }),
      });
      return {
        ok: res.ok,
        provider: "microsoft",
        externalId,
        idempotencyKey: meta.idempotencyKey,
        deduped: false,
        mode: "live",
        error: res.ok ? undefined : `update failed: ${res.status}`,
      };
    });
  }

  async createCalendarEvent(
    payload: CalendarPayload,
    meta: ConnectorWriteMeta,
  ): Promise<ConnectorResult> {
    return once(meta.idempotencyKey, async () => {
      if (!this.accessToken) {
        if (!this.mockWritesEnabled) {
          return {
            ok: false,
            provider: "microsoft",
            idempotencyKey: meta.idempotencyKey,
            deduped: false,
            mode: "mock",
            error: "Microsoft is not connected.",
          };
        }
        return {
          ok: true,
          provider: "microsoft",
          externalId: `outlook_evt_mock_${meta.idempotencyKey}`,
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "mock",
        };
      }
      const res = await fetch(`${GRAPH}/me/events`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          subject: payload.title,
          start: { dateTime: payload.startAt, timeZone: "UTC" },
          end: { dateTime: payload.endAt, timeZone: "UTC" },
          body: { contentType: "Text", content: payload.notes ?? "" },
        }),
      });
      if (!res.ok) {
        return {
          ok: false,
          provider: "microsoft",
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "live",
          error: `Outlook event failed: ${res.status}`,
        };
      }
      const data = (await res.json()) as { id: string; webLink?: string };
      return {
        ok: true,
        provider: "microsoft",
        externalId: data.id,
        url: data.webLink,
        idempotencyKey: meta.idempotencyKey,
        deduped: false,
        mode: "live",
      };
    });
  }

  private no(meta: ConnectorWriteMeta, what: string): Promise<ConnectorResult> {
    return Promise.resolve({
      ok: false,
      provider: "microsoft",
      idempotencyKey: meta.idempotencyKey,
      deduped: false,
      mode: this.mode,
      error: `${what} not supported by Outlook draft connector.`,
    });
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
      provider: "microsoft",
      healthy: Boolean(this.accessToken) || this.mockWritesEnabled,
      mode: this.mode,
      detail: this.accessToken
        ? "Connected — Outlook drafts + Calendar events."
        : this.mockWritesEnabled
          ? "Not connected — connect Microsoft in the Connector Hub to draft in Outlook."
          : "Not connected — connect Microsoft in the Connector Hub to draft in Outlook.",
      capabilities: this.capabilities,
    };
  }
}
