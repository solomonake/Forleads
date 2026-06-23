// ============================================================================
// Connector interface (docs/Forleads_ProductionMarketPlan_v1.md §6, S12).
// Every connector implements the same surface. Every WRITE is idempotent: the
// caller supplies an idempotency key and a retry never duplicates a side effect
// (§10 production guardrails).
// ============================================================================

import type {
  CalendarPayload,
  ConnectorProvider,
  CrmNotePayload,
  EmailPayload,
  SmsPayload,
  TaskPayload,
} from "@/lib/core/types";

export interface ConnectorWriteMeta {
  idempotencyKey: string;
  agentId: string;
  leadSurfaceId?: string;
}

export interface ConnectorResult {
  ok: boolean;
  provider: ConnectorProvider;
  externalId?: string;
  url?: string;
  idempotencyKey: string;
  deduped: boolean; // true if a prior identical write was returned
  mode: "mock" | "live";
  error?: string;
}

export interface HealthStatus {
  provider: ConnectorProvider;
  healthy: boolean;
  mode: "mock" | "live";
  detail: string;
  capabilities: string[];
}

export interface Connector {
  readonly provider: ConnectorProvider;
  readonly mode: "mock" | "live";
  readonly capabilities: string[];

  createDraft(payload: EmailPayload, meta: ConnectorWriteMeta): Promise<ConnectorResult>;
  updateDraft(
    externalId: string,
    payload: EmailPayload,
    meta: ConnectorWriteMeta
  ): Promise<ConnectorResult>;
  createTask(payload: TaskPayload, meta: ConnectorWriteMeta): Promise<ConnectorResult>;
  createCalendarEvent(
    payload: CalendarPayload,
    meta: ConnectorWriteMeta
  ): Promise<ConnectorResult>;
  writeCrmNote(payload: CrmNotePayload, meta: ConnectorWriteMeta): Promise<ConnectorResult>;
  sendSms?(payload: SmsPayload, meta: ConnectorWriteMeta): Promise<ConnectorResult>;
  syncContacts(meta: ConnectorWriteMeta): Promise<{ imported: number; mode: "mock" | "live" }>;
  healthCheck(): Promise<HealthStatus>;
}
