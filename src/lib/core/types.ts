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
}

export type ScoutStatus =
  | "ok"
  | "partial"
  | "insufficient_evidence"
  | "budget_exceeded";

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

export type Situation =
  | "no_contact"
  | "interested_seller"
  | "objection:timing"
  | "objection:price"
  | "objection:agent_loyalty"
  | "buyer_criteria"
  | "needs_repair_info"
  | "dead_not_now"
  | "unknown";

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

export type ActionType = "email" | "sms" | "task" | "calendar" | "crm_note";

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
  created_at: ISODate;
  approved_at?: ISODate;
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
  | "artifact.approved"
  | "artifact.sent"
  | "artifact.blocked"
  | "email.reply"
  | "task.due"
  | "watcher.hit"
  | "loop.run.started"
  | "loop.run.completed"
  | "connector.write";

export interface DomainEvent {
  id: UUID;
  agent_id: UUID;
  lead_surface_id?: UUID;
  type: DomainEventType;
  payload: Record<string, unknown>;
  source: string;
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
  connector?: { provider: string; action: string; idempotencyKey: string; sent: boolean };
  cost: { claudeCalls: number; paidDataCalls: number; ms: number };
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
