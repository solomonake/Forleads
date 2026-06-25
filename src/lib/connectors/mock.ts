// ============================================================================
// MockConnector — a fully working local connector so the entire product loop
// runs end to end with zero credentials. Honors idempotency exactly like the
// real adapters; "drafts" are stored in memory and surfaced in the Action Inbox.
// ============================================================================

import type {
  CalendarPayload,
  ConnectorProvider,
  CrmNotePayload,
  EmailPayload,
  SmsPayload,
  TaskPayload,
} from "@/lib/core/types";
import { once } from "./idempotency";
import type {
  Connector,
  ConnectorResult,
  ConnectorWriteMeta,
  HealthStatus,
} from "./types";

interface MockRecord {
  kind: string;
  externalId: string;
  payload: unknown;
}

const store: MockRecord[] = [];

export class MockConnector implements Connector {
  readonly mode = "mock" as const;
  readonly capabilities = [
    "createDraft",
    "updateDraft",
    "createTask",
    "createCalendarEvent",
    "writeCrmNote",
    "sendSms",
    "syncContacts",
  ];

  constructor(
    public readonly provider: ConnectorProvider = "google",
    private readonly writesEnabled = true,
  ) {}

  private write(kind: string, payload: unknown, meta: ConnectorWriteMeta): Promise<ConnectorResult> {
    return once(meta.idempotencyKey, async () => {
      if (!this.writesEnabled) {
        return {
          ok: false,
          provider: this.provider,
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "mock",
          error: `${this.provider} is not configured. Add live credentials before approving this action.`,
        };
      }
      const externalId = `mock_${kind}_${meta.idempotencyKey}`;
      store.push({ kind, externalId, payload });
      return {
        ok: true,
        provider: this.provider,
        externalId,
        url: `https://mock.forleads.local/${kind}/${externalId}`,
        idempotencyKey: meta.idempotencyKey,
        deduped: false,
        mode: "mock",
      };
    });
  }

  createDraft(payload: EmailPayload, meta: ConnectorWriteMeta) {
    return this.write("draft", payload, meta);
  }
  updateDraft(externalId: string, payload: EmailPayload, meta: ConnectorWriteMeta) {
    return this.write("draft_update", { externalId, payload }, meta);
  }
  createTask(payload: TaskPayload, meta: ConnectorWriteMeta) {
    return this.write("task", payload, meta);
  }
  createCalendarEvent(payload: CalendarPayload, meta: ConnectorWriteMeta) {
    return this.write("calendar", payload, meta);
  }
  writeCrmNote(payload: CrmNotePayload, meta: ConnectorWriteMeta) {
    return this.write("crm_note", payload, meta);
  }
  sendSms(payload: SmsPayload, meta: ConnectorWriteMeta) {
    return this.write("sms", payload, meta);
  }
  async syncContacts() {
    return { imported: this.writesEnabled ? 12 : 0, mode: "mock" as const };
  }
  async healthCheck(): Promise<HealthStatus> {
    return {
      provider: this.provider,
      healthy: this.writesEnabled,
      mode: "mock",
      detail: this.writesEnabled
        ? "Local mock connector — writes stay on this machine."
        : "Setup required — production mock writes are disabled.",
      capabilities: this.capabilities,
    };
  }
}

export function mockConnectorRecords(): ReadonlyArray<MockRecord> {
  return store;
}
