// ============================================================================
// GmailDraftConnector — real Gmail API shape with OAuth/env hooks and proper
// MIME/base64url draft creation. Scope is minimal: gmail.compose (drafts only),
// never broad mailbox access (docs/_ProductionMarketPlan_ §6/§10).
//
// Falls back gracefully: with no access token it behaves like a clearly-labeled
// mock so the flow still runs, but the REAL call path is implemented.
// ============================================================================

import type { CalendarPayload, CrmNotePayload, EmailPayload, SmsPayload, TaskPayload } from "@/lib/core/types";
import { once } from "./idempotency";
import { buildGmailRaw } from "./mime";
import type { Connector, ConnectorResult, ConnectorWriteMeta, HealthStatus } from "./types";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";

export class GmailDraftConnector implements Connector {
  readonly provider = "google" as const;
  readonly capabilities = ["createDraft", "updateDraft"];
  readonly mode: "mock" | "live";

  constructor(
    private accessToken?: string,
    private readonly mockWritesEnabled = true,
  ) {
    this.mode = accessToken ? "live" : "mock";
  }

  async createDraft(payload: EmailPayload, meta: ConnectorWriteMeta): Promise<ConnectorResult> {
    return once(meta.idempotencyKey, async () => {
      const raw = buildGmailRaw({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        body: payload.body,
      });

      // Mock fallback — flow still completes without credentials.
      if (!this.accessToken) {
        if (!this.mockWritesEnabled) {
          return {
            ok: false,
            provider: "google",
            idempotencyKey: meta.idempotencyKey,
            deduped: false,
            mode: "mock",
            error: "Google is not connected. Complete Google OAuth before approving an email draft.",
          };
        }
        return {
          ok: true,
          provider: "google",
          externalId: `gmail_mock_${meta.idempotencyKey}`,
          url: "https://mail.google.com/mail/u/0/#drafts",
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "mock",
        };
      }

      try {
        const res = await fetch(GMAIL_API, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: { raw } }),
        });
        if (!res.ok) {
          return {
            ok: false,
            provider: "google",
            idempotencyKey: meta.idempotencyKey,
            deduped: false,
            mode: "live",
            error: `Gmail drafts.create failed: ${res.status}`,
          };
        }
        const data = (await res.json()) as { id: string; message?: { id: string } };
        return {
          ok: true,
          provider: "google",
          externalId: data.id,
          url: `https://mail.google.com/mail/u/0/#drafts?compose=${data.message?.id ?? data.id}`,
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "live",
        };
      } catch (e) {
        return {
          ok: false,
          provider: "google",
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "live",
          error: e instanceof Error ? e.message : "network error",
        };
      }
    });
  }

  async updateDraft(externalId: string, payload: EmailPayload, meta: ConnectorWriteMeta): Promise<ConnectorResult> {
    return once(meta.idempotencyKey, async () => {
      const raw = buildGmailRaw({ from: payload.from, to: payload.to, subject: payload.subject, body: payload.body });
      if (!this.accessToken) {
        if (!this.mockWritesEnabled) {
          return {
            ok: false,
            provider: "google",
            idempotencyKey: meta.idempotencyKey,
            deduped: false,
            mode: "mock",
            error: "Google is not connected. Complete Google OAuth before updating an email draft.",
          };
        }
        return {
          ok: true,
          provider: "google",
          externalId,
          idempotencyKey: meta.idempotencyKey,
          deduped: false,
          mode: "mock",
        };
      }
      const res = await fetch(`${GMAIL_API}/${externalId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { raw } }),
      });
      return {
        ok: res.ok,
        provider: "google",
        externalId,
        idempotencyKey: meta.idempotencyKey,
        deduped: false,
        mode: "live",
        error: res.ok ? undefined : `update failed: ${res.status}`,
      };
    });
  }

  // Gmail connector is drafts-only by design (minimal scope).
  private unsupported(meta: ConnectorWriteMeta, what: string): Promise<ConnectorResult> {
    return Promise.resolve({
      ok: false,
      provider: "google",
      idempotencyKey: meta.idempotencyKey,
      deduped: false,
      mode: this.mode,
      error: `${what} not supported by Gmail draft connector — use the Calendar/CRM connector.`,
    });
  }
  createTask(_p: TaskPayload, meta: ConnectorWriteMeta) {
    return this.unsupported(meta, "createTask");
  }
  createCalendarEvent(_p: CalendarPayload, meta: ConnectorWriteMeta) {
    return this.unsupported(meta, "createCalendarEvent");
  }
  writeCrmNote(_p: CrmNotePayload, meta: ConnectorWriteMeta) {
    return this.unsupported(meta, "writeCrmNote");
  }
  sendSms(_p: SmsPayload, meta: ConnectorWriteMeta) {
    return this.unsupported(meta, "sendSms");
  }
  async syncContacts() {
    return { imported: 0, mode: this.mode };
  }
  async healthCheck(): Promise<HealthStatus> {
    return {
      provider: "google",
      healthy: Boolean(this.accessToken) || this.mockWritesEnabled,
      mode: this.mode,
      detail: this.accessToken
        ? "Connected — Gmail compose (drafts only)."
        : this.mockWritesEnabled
          ? "Local mock mode — connect Google OAuth to go live."
          : "Setup required — connect Google OAuth; production mock writes are disabled.",
      capabilities: this.capabilities,
    };
  }
}
