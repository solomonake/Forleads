// ============================================================================
// GoHighLevelConnector — real GHL (LeadConnector) v2 API shape for agencies.
// Contacts/notes/tasks under a locationId. Mocks gracefully without a key.
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

export class GoHighLevelConnector implements Connector {
  readonly provider = "gohighlevel" as const;
  readonly capabilities = ["writeCrmNote", "createTask", "syncContacts"];
  readonly mode: "mock" | "live";
  constructor(
    private apiKey?: string,
    private locationId?: string,
    private baseUrl = "https://services.leadconnectorhq.com",
    private readonly mockWritesEnabled = true,
  ) {
    this.mode = apiKey && locationId ? "live" : "mock";
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
    };
  }

  private async post(path: string, body: unknown, meta: ConnectorWriteMeta, kind: string): Promise<ConnectorResult> {
    return once(meta.idempotencyKey, async () => {
      if (this.mode === "mock") {
        if (!this.mockWritesEnabled) {
          return {
            ok: false,
            provider: "gohighlevel",
            idempotencyKey: meta.idempotencyKey,
            deduped: false,
            mode: "mock",
            error: "GoHighLevel is not configured. Add GHL_API_KEY and GHL_LOCATION_ID.",
          };
        }
        return {
          ok: true,
          provider: "gohighlevel",
          externalId: `ghl_mock_${kind}_${meta.idempotencyKey}`,
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "mock",
        };
      }
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      });
      const data = res.ok ? ((await res.json()) as { id?: string }) : null;
      return {
        ok: res.ok,
        provider: "gohighlevel",
        externalId: data?.id,
        idempotencyKey: meta.idempotencyKey,
        deduped: false,
        mode: "live",
        error: res.ok ? undefined : `GHL ${path} failed: ${res.status}`,
      };
    });
  }

  writeCrmNote(payload: CrmNotePayload, meta: ConnectorWriteMeta) {
    return this.post("/contacts/notes", { locationId: this.locationId, body: payload.body }, meta, "note");
  }
  createTask(payload: TaskPayload, meta: ConnectorWriteMeta) {
    return this.post(
      "/contacts/tasks",
      { locationId: this.locationId, title: payload.title, dueDate: payload.dueAt },
      meta,
      "task"
    );
  }
  async syncContacts() {
    return {
      imported: this.mode === "mock" && this.mockWritesEnabled ? 18 : 0,
      mode: this.mode,
    };
  }

  private no(meta: ConnectorWriteMeta, what: string): Promise<ConnectorResult> {
    return Promise.resolve({
      ok: false,
      provider: "gohighlevel",
      idempotencyKey: meta.idempotencyKey,
      deduped: false,
      mode: this.mode,
      error: `${what} not supported by GoHighLevel connector.`,
    });
  }
  createDraft(_p: EmailPayload, m: ConnectorWriteMeta) {
    return this.no(m, "createDraft");
  }
  updateDraft(_id: string, _p: EmailPayload, m: ConnectorWriteMeta) {
    return this.no(m, "updateDraft");
  }
  createCalendarEvent(_p: CalendarPayload, m: ConnectorWriteMeta) {
    return this.no(m, "createCalendarEvent");
  }
  sendSms(_p: SmsPayload, m: ConnectorWriteMeta) {
    return this.no(m, "sendSms");
  }
  async healthCheck(): Promise<HealthStatus> {
    return {
      provider: "gohighlevel",
      healthy: this.mode === "live" || this.mockWritesEnabled,
      mode: this.mode,
      detail:
        this.mode === "live"
          ? "Connected — notes/tasks."
          : this.mockWritesEnabled
            ? "Local mock mode — add GHL_API_KEY + GHL_LOCATION_ID."
            : "Setup required — add GHL_API_KEY + GHL_LOCATION_ID; production mock writes are disabled.",
      capabilities: this.capabilities,
    };
  }
}
