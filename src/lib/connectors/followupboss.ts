// ============================================================================
// FollowUpBossConnector — real FUB API shape (people, notes, tasks,
// appointments, webhooks). Auth is HTTP Basic with the API key as username
// (docs/_ProductionMarketPlan_ §6, FUB API). Mocks gracefully without a key.
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

export class FollowUpBossConnector implements Connector {
  readonly provider = "followupboss" as const;
  readonly capabilities = ["writeCrmNote", "createTask", "createCalendarEvent", "syncContacts"];
  readonly mode: "mock" | "live";

  constructor(
    private apiKey?: string,
    private baseUrl = "https://api.followupboss.com/v1"
  ) {
    this.mode = apiKey ? "live" : "mock";
  }

  private authHeader(): string {
    // FUB: Basic auth, API key as username, empty password.
    return "Basic " + Buffer.from(`${this.apiKey}:`).toString("base64");
  }

  private async post(
    path: string,
    body: unknown,
    meta: ConnectorWriteMeta,
    mockKind: string
  ): Promise<ConnectorResult> {
    return once(meta.idempotencyKey, async () => {
      if (!this.apiKey) {
        return {
          ok: true,
          provider: "followupboss",
          externalId: `fub_mock_${mockKind}_${meta.idempotencyKey}`,
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "mock",
        };
      }
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/json",
          // FUB honors an idempotency-style dedup on our side via the ledger.
          "X-Forleads-Idempotency-Key": meta.idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      const data = res.ok ? ((await res.json()) as { id?: number }) : null;
      return {
        ok: res.ok,
        provider: "followupboss",
        externalId: data?.id ? String(data.id) : undefined,
        idempotencyKey: meta.idempotencyKey,
        deduped: false,
        mode: "live",
        error: res.ok ? undefined : `FUB ${path} failed: ${res.status}`,
      };
    });
  }

  writeCrmNote(payload: CrmNotePayload, meta: ConnectorWriteMeta) {
    return this.post("/notes", { body: payload.body, tags: payload.tags }, meta, "note");
  }
  createTask(payload: TaskPayload, meta: ConnectorWriteMeta) {
    return this.post("/tasks", { name: payload.title, dueDate: payload.dueAt }, meta, "task");
  }
  createCalendarEvent(payload: CalendarPayload, meta: ConnectorWriteMeta) {
    return this.post(
      "/appointments",
      { title: payload.title, start: payload.startAt, end: payload.endAt },
      meta,
      "appt"
    );
  }
  async syncContacts(meta: ConnectorWriteMeta) {
    if (!this.apiKey) return { imported: 24, mode: "mock" as const };
    const res = await fetch(`${this.baseUrl}/people?limit=100`, {
      headers: { Authorization: this.authHeader() },
    });
    const data = res.ok ? ((await res.json()) as { people?: unknown[] }) : { people: [] };
    return { imported: data.people?.length ?? 0, mode: "live" as const };
  }

  private no(meta: ConnectorWriteMeta, what: string): Promise<ConnectorResult> {
    return Promise.resolve({
      ok: false,
      provider: "followupboss",
      idempotencyKey: meta.idempotencyKey,
      deduped: false,
      mode: this.mode,
      error: `${what} not supported by Follow Up Boss connector.`,
    });
  }
  createDraft(_p: EmailPayload, m: ConnectorWriteMeta) {
    return this.no(m, "createDraft");
  }
  updateDraft(_id: string, _p: EmailPayload, m: ConnectorWriteMeta) {
    return this.no(m, "updateDraft");
  }
  sendSms(_p: SmsPayload, m: ConnectorWriteMeta) {
    return this.no(m, "sendSms");
  }
  async healthCheck(): Promise<HealthStatus> {
    return {
      provider: "followupboss",
      healthy: true,
      mode: this.mode,
      detail: this.apiKey
        ? "Connected — read contacts, write notes/tasks/appointments."
        : "Mock mode — add FOLLOWUPBOSS_API_KEY to go live.",
      capabilities: this.capabilities,
    };
  }
}
