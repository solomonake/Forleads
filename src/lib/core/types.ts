// ============================================================================
// Forleads core domain types — the contracts the whole system is built on.
// Mirrors docs/Forleads_Architecture_v1.md §5, _AgentLoops_ §2,
// and _ProductionMarketPlan_ §5.
// ============================================================================

export type UUID = string;
export type ISODate = string;

// ---- Confidence & evidence (the "no naked numbers" contract) ----------------

export type Confidence = "A" | "B" | "C" | "D";
// A = official record / recent verified comp
// B = modeled from >= 3 independent signals
// C = sparse / single weak signal / heuristic
// D = insufficient evidence -> SAY SO (value null, honest gap)

export type ScoutType = "property" | "imagery" | "people" | "market" | "risk";

export interface EvidenceSource {
  name: string;
  url?: string;
  as_of?: string;
}

export interface EvidenceCard {
  id?: UUID;
  lead_surface_id?: UUID;
  scout: ScoutType;
  claim: string; // e.g. "Building footprint ~ 180 m²"
  value: string | number | null; // null allowed ONLY with confidence 'D'
  sources: EvidenceSource[]; // >= 1 unless confidence 'D'
  confidence: Confidence;
  reasoning?: string; // shown on "why this grade"
  created_at?: ISODate;
}

export interface ScoutCost {
  ms: number;
  tokens: number;
  calls: number;
  cacheHit?: boolean;
}

export type ScoutStatus =
  | "ok"
  | "partial"
  | "insufficient_evidence"
  | "budget_exceeded"
  | "error";

export interface ScoutResult {
  scout: ScoutType;
  cards: EvidenceCard[];
  gaps: string[];
  cost: ScoutCost;
  status: ScoutStatus;
}

export interface ScoutBudget {
  maxCalls: number;
  maxMs: number;
  maxTokens: number;
}

export interface ScoutJob {
  type: ScoutType;
  budget: ScoutBudget;
  why: string;
  allowlist: string[];
}

export interface DispatchPlan {
  scouts: ScoutJob[];
  memory_used: string[];
  notes: string[];
}

export interface ReduceSummary {
  cards: EvidenceCard[];
  grade: Confidence;
  gaps: string[];
  breakout?: {
    kind: "deeper_scout" | "ask_human";
    target: string;
    question?: string;
    reason: string;
  };
  scoutCount: number;
  elapsedMs: number;
  /** FOMO-style copy describing recall hits — null when no prior memory was used. */
  recallNote?: string;
  /** Count of cross-lead area-cell priors the dispatcher saw for
   *  this location. Surfaced in the lead rail as an area-facts note.
   *  Undefined when there are no priors. */
  neighborhoodPriors?: number;
  /** A short line — "5 area facts known near this location" — when
   *  neighborhoodPriors > 0; null otherwise. */
  neighborhoodNote?: string;
  /** When recall fired, a compact projection of the hits so the rail can render
   * an expandable chip ("8 prior signals" → list of [A] Building footprint…).
   * Excludes the embedding vector — only the surface form, kind, grade, ref,
   * and timestamp. Sorted newest-first. */
  recalledHits?: RecalledHit[];
}

export interface RecalledHit {
  memoryId: UUID;
  kind: MemoryKind;
  text: string;
  confidence?: Confidence;
  ref?: string;
  createdAt: ISODate;
}

// ---- Memory (lead-scoped recall: docs/Forleads_AgentLoops_v1.md §3) ---------
// A persisted, embedded snippet — a prior evidence card, a note, or a domain
// event — that the dispatcher can recall before spending scout budget. Scoped
// to a single lead surface; cross-lead leakage would defeat the privacy floor.

export type MemoryKind = "evidence" | "note" | "event" | "outcome" | "neighborhood";

// Persisted whenever the human gate fires (approve / edit / reject). Lets the
// composer answer "what did the agent ALREADY send to this lead?" and warn
// before drafting a duplicate. Distinct from `event` so we can filter.
export type OutcomeVerdict = "approved" | "edited" | "rejected";

export interface PriorOutcomeSummary {
  approved: number;
  edited: number;
  rejected: number;
  latestVerdict: OutcomeVerdict;
  latestAt: ISODate;
  /** ISO timestamp of the most recent rejected outcome — used by the composer
   *  to soften tone when the previous attempt was refused recently. */
  lastRejectedAt?: ISODate;
}

export interface Memory {
  id: UUID;
  agent_id: UUID;
  lead_surface_id: UUID;
  kind: MemoryKind;
  text: string;                 // the embedded surface form (what was hashed)
  ref?: string;                 // optional pointer to the source row id
  confidence?: Confidence;      // mirrored from the source card when kind=evidence
  /** Set ONLY for kind="neighborhood" — the area cell this fact aggregates over.
   *  Only grounded provider-backed market facts may be written here. */
  h3_index?: string;
  embedding: number[];          // 1024-dim (bge-m3 / Qwen3-Embedding-0.6B)
  created_at: ISODate;
}

export interface MemoryHit {
  memory: Memory;
  similarity: number;           // cosine, 0..1
}

// ---- Lead surface (the spatial unit) ----------------------------------------

export type LeadStatus =
  | "new"
  | "researching"
  | "contacted"
  | "nurturing"
  | "appointment"
  | "won"
  | "dead";

export interface LeadSurface {
  id: UUID;
  agent_id: UUID;
  lng: number;
  lat: number;
  address: string;
  locality?: string;
  h3_index: string;
  status: LeadStatus;
  label?: string;
  contact?: LeadContact;
  first_seen_at: ISODate;
  last_worked_at: ISODate;
}

export interface LeadContact {
  name?: string;
  email?: string;
  phone?: string;
  optOutEmail?: boolean;
  optOutSms?: boolean;
}

// ---- Notes & situations -----------------------------------------------------

export type NoteModality = "text" | "voice";

export const SITUATIONS = [
  "no_contact",
  "interested_seller",
  "objection:timing",
  "objection:price",
  "objection:agent_loyalty",
  "buyer_criteria",
  "needs_repair_info",
  "dead_not_now",
  "unknown",
] as const;
export type Situation = (typeof SITUATIONS)[number];

export interface Note {
  id: UUID;
  lead_surface_id: UUID;
  agent_id: UUID;
  body: string;
  modality: NoteModality;
  situation?: Situation;
  created_at: ISODate;
}

export interface SuggestedAction {
  type: ActionType;
  label: string;
  recommended: boolean;
  rationale: string;
}

export interface NoteClassification {
  situation: Situation;
  confidence: number; // 0..1
  suggested_actions: SuggestedAction[];
  reasoning: string;
}

// ---- Actions / artifacts (drafts) -------------------------------------------

export const ACTION_TYPES = ["email", "sms", "task", "calendar", "crm_note"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export type ArtifactStatus =
  | "drafted"
  | "blocked"
  | "approved"
  | "sent"
  | "cancelled"
  | "snoozed";

export interface ComplianceFlag {
  span: string;
  issue: string;
  category: string; // e.g. "familial_status"
  fix: string;
  severity: "block" | "warn";
}

export interface ComplianceResult {
  pass: boolean;
  flags: ComplianceFlag[];
  checkedAt: ISODate;
  linterVersion: string;
}

export interface EmailPayload {
  from: string;
  to: string;
  subject: string;
  body: string;
  signatureHtml?: string;
}

export interface SmsPayload {
  to: string;
  body: string;
}

export interface TaskPayload {
  title: string;
  dueAt: ISODate;
  notes?: string;
}

export interface CalendarPayload {
  title: string;
  startAt: ISODate;
  endAt: ISODate;
  notes?: string;
}

export interface CrmNotePayload {
  contactRef?: string;
  body: string;
  tags?: string[];
}

export type ArtifactPayload =
  | EmailPayload
  | SmsPayload
  | TaskPayload
  | CalendarPayload
  | CrmNotePayload;

export interface ModelTrace {
  model: string;
  promptVersion: string;
  mode: "mock" | "live";
  tokens?: number;
  ms?: number;
}

export interface ExternalDraftRef {
  provider: string;
  externalId: string;
  url?: string;
  idempotencyKey: string;
}

export interface Artifact {
  id: UUID;
  agent_id: UUID;
  lead_surface_id?: UUID;
  loop_run_id?: UUID;
  type: ActionType;
  status: ArtifactStatus;
  payload: ArtifactPayload;
  evidence_used: EvidenceCard[];
  compliance_result: ComplianceResult;
  model_trace: ModelTrace;
  external_draft_ref?: ExternalDraftRef;
  trace_id?: UUID;
  revision: number;
  created_at: ISODate;
  updated_at: ISODate;
  approved_at?: ISODate;
  approved_revision?: number;
  sent_at?: ISODate;
  snooze_until?: ISODate;
  edit_history?: ArtifactEdit[];
}

export interface ArtifactEdit {
  at: ISODate;
  field: string;
  before: string;
  after: string;
}

// ---- Domain events (the event bus) ------------------------------------------

export type DomainEventType =
  | "lead.tapped"
  | "lead.created"
  | "note.created"
  | "artifact.drafted"
  | "artifact.edited"
  | "artifact.approved"
  | "artifact.sent"
  | "artifact.blocked"
  | "email.reply"
  | "task.due"
  | "watcher.hit"
  | "loop.run.started"
  | "loop.run.completed"
  | "connector.write"
  | "artifact.cancelled"
  | "outcome.recorded"
  | "memory.recalled";

export interface DomainEvent {
  id: UUID;
  agent_id: UUID;
  lead_surface_id?: UUID;
  type: DomainEventType;
  payload: Record<string, unknown>;
  source: string;
  idempotency_key?: string;
  created_at: ISODate;
}

export interface ConnectorWrite {
  id: UUID;
  agent_id: UUID;
  artifact_id?: UUID;
  provider: string;
  idempotency_key: string;
  result: {
    ok: boolean;
    externalId?: string;
    url?: string;
    deduped: boolean;
    mode: string;
    error?: string;
  };
  created_at: ISODate;
}

// ---- Loops ------------------------------------------------------------------

export interface LoopTrigger {
  event: DomainEventType;
  match?: Record<string, unknown>; // e.g. { situation: "no_contact" }
}

export interface LoopCondition {
  kind:
    | "has_contact_channel"
    | "not_opted_out"
    | "status_not_in"
    | "no_activity_days"
    | "status_in"
    | "has_evidence";
  value?: unknown;
}

export interface LoopActionSpec {
  type: ActionType;
  template: string;
  requiresApproval: boolean;
  delayDays?: number; // for follow-up tasks
}

export interface LoopDefinition {
  id: UUID;
  agent_id: UUID;
  name: string;
  description: string;
  trigger: LoopTrigger;
  conditions: LoopCondition[];
  actions: LoopActionSpec[];
  cadence?: { everyDays?: number; reportDay?: string };
  active: boolean;
  created_at: ISODate;
  stats?: LoopStats;
}

export interface LoopStats {
  runs: number;
  approved: number;
  replies: number;
  blocked: number;
}

export interface LoopAnalytics extends LoopStats {
  produced: number;
  skipped: number;
}

export type LoopRunStatus =
  | "started"
  | "skipped_condition"
  | "produced_artifact"
  | "blocked_compliance"
  | "completed"
  | "error";

export interface LoopRunStep {
  at: ISODate;
  stage: string;
  detail: string;
  outcome: "pass" | "fail" | "info";
}

export interface LoopRun {
  id: UUID;
  loop_definition_id: UUID;
  agent_id: UUID;
  lead_surface_id?: UUID;
  status: LoopRunStatus;
  planner_trace: LoopRunStep[];
  artifact_ids: UUID[];
  started_at: ISODate;
  completed_at?: ISODate;
}

// ---- Watchers ---------------------------------------------------------------

export interface Watcher {
  id: UUID;
  agent_id: UUID;
  name: string;
  criteria: BuyerCriteria;
  area_label: string;
  last_run_at?: ISODate;
  active: boolean;
  hits: number;
}

export interface BuyerCriteria {
  beds?: number;
  features?: string[];
  maxPrice?: number;
  district?: string;
}

// ---- Agent Trace ("Why this happened") --------------------------------------

export interface AgentTrace {
  id: UUID;
  agent_id: UUID;
  artifact_id?: UUID;
  loop_run_id?: UUID;
  trigger: string;
  situation?: string;
  situationConfidence?: number;
  evidenceUsed: { claim: string; confidence: Confidence }[];
  excluded: { content: string; reason: string }[];
  policy: { name: string; result: "pass" | "fail" }[];
  /** Summary of prior approve/edit/reject outcomes the composer consulted for
   *  this lead+actionType — surfaced in the "Why this happened" panel. */
  priorOutcomes?: PriorOutcomeSummary;
  connector?: { provider: string; action: string; idempotencyKey: string; sent: boolean };
  cost: {
    claudeCalls: number;
    paidDataCalls: number;
    ms: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    providerCalls?: number;
    cacheHits?: number;
    estimatedCostUsd?: number;
    fallbackReason?: string;
    knowledgeSourceIds?: string[];
  };
  created_at: ISODate;
}

// ---- Connector account ------------------------------------------------------

export type ConnectorProvider =
  | "google"
  | "microsoft"
  | "followupboss"
  | "gohighlevel"
  | "twilio"
  | "zapier";

export type ConnectorStatus =
  | "connected"
  | "mock"
  | "needs_setup"
  | "error"
  | "not_connected";

export interface ConnectorAccount {
  id: UUID;
  agent_id: UUID;
  provider: ConnectorProvider;
  scopes: string[];
  status: ConnectorStatus;
  credentials_ref: string; // pointer to vaulted creds; NEVER raw secrets
  capabilities: string[];
  last_healthcheck_at?: ISODate;
  created_at: ISODate;
}

export interface ConnectorCredential {
  id: UUID;
  agent_id: UUID;
  provider: ConnectorProvider;
  encrypted_payload: string;
  version: number;
  created_at: ISODate;
  updated_at: ISODate;
  revoked_at?: ISODate;
}

// ---- Agent / identity -------------------------------------------------------

export type BrandVoicePreset = "warm_local" | "crisp_pro" | "luxury";

export interface Agent {
  id: UUID;
  name: string;
  email: string;
  signatureHtml: string;
  brandVoice: BrandVoicePreset;
  locale: string;
  mode: "crm" | "overlay";
}

// ---- Reports ----------------------------------------------------------------

export interface WeeklyReport {
  id: UUID;
  agent_id: UUID;
  periodStart: ISODate;
  periodEnd: ISODate;
  metrics: {
    prepared: number;
    approved: number;
    sent: number;
    replies: number;
    bookings: number;
    blocked: number;
  };
  whatChanged: string[];
  recommendations: { label: string; action: string }[];
  generated_at: ISODate;
}
