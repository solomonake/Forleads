// ============================================================================
// SupabaseRepository — the durable, Postgres-backed implementation of the
// Repository interface (mirror of InMemoryRepository). Activated by
// FORLEADS_PERSIST=supabase + Supabase URL/service-role key.
//
// SECURITY: uses the SERVICE ROLE key, which BYPASSES Row-Level Security.
// This module is server-only and is constructed exclusively in db/index.ts.
// Per-user scoping is enforced in application code via agent_id (and, once
// Supabase Auth is wired, by the agent-scoped RLS policies in 0002_rls.sql for
// any direct anon-key access). Never import this from a client component.
//
// Mapping notes:
//  - DB columns are snake_case; some domain fields are camelCase (Agent,
//    AgentTrace, WeeklyReport). Mappers below are the single source of truth.
//  - lead_surface.geom is PostGIS geography(Point). We READ lng/lat from STORED
//    generated columns and WRITE through the fl_upsert_lead_surface RPC, both
//    added in migration 0003_geo_helpers.sql.
//  - Seed IDs for loops/connectors are slugs (e.g. "loop-no-contact"); the PKs
//    are uuid. toUuid() maps slugs to a STABLE uuid v5 so upserts stay
//    idempotent across cold starts. Real runtime IDs are already uuids and pass
//    through unchanged.
// ============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { uuidV5 } from "@/lib/core/ids";
import type {
  Agent,
  AgentTrace,
  Artifact,
  ConnectorAccount,
  ConnectorProvider,
  Confidence,
  DomainEvent,
  EvidenceCard,
  LeadSurface,
  LoopDefinition,
  LoopRun,
  Memory,
  MemoryHit,
  MemoryKind,
  Note,
  Watcher,
  WeeklyReport,
} from "@/lib/core/types";
import type { Repository } from "./repository";

// ---- Deterministic UUIDs for stable slug IDs --------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** uuid passthrough; non-uuid slugs → stable uuid v5. */
function toUuid(id: string): string {
  return UUID_RE.test(id) ? id : uuidV5(id);
}

// ---- Row types (loose; we only read the columns we map) ---------------------

type Row = Record<string, any>;

function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`[supabase] ${res.error.message}`);
  return res.data;
}

// ---- Mappers (domain <-> row) -----------------------------------------------

const agentToRow = (a: Agent): Row => ({
  id: a.id,
  name: a.name,
  email: a.email,
  brand_voice: a.brandVoice,
  signature_html: a.signatureHtml,
  locale: a.locale,
  mode: a.mode,
});
const agentFromRow = (r: Row): Agent => ({
  id: r.id,
  name: r.name,
  email: r.email,
  signatureHtml: r.signature_html ?? "",
  brandVoice: r.brand_voice,
  locale: r.locale,
  mode: r.mode,
});

const leadFromRow = (r: Row): LeadSurface => ({
  id: r.id,
  agent_id: r.agent_id,
  lng: Number(r.lng),
  lat: Number(r.lat),
  address: r.address,
  locality: r.locality ?? undefined,
  h3_index: r.h3_index,
  status: r.status,
  label: r.label ?? undefined,
  contact: r.contact_json ?? undefined,
  first_seen_at: r.first_seen_at,
  last_worked_at: r.last_worked_at,
});

const evidenceFromRow = (r: Row): EvidenceCard => ({
  id: r.id,
  lead_surface_id: r.lead_surface_id,
  scout: r.scout,
  claim: r.claim,
  value: r.value_json ?? null,
  sources: r.source_json ?? [],
  confidence: r.confidence,
  reasoning: r.reasoning ?? undefined,
  created_at: r.created_at,
});

export const evidenceToRow = (leadId: string, c: EvidenceCard): Row => ({
  ...(c.id ? { id: c.id } : {}),
  lead_surface_id: leadId,
  scout: c.scout,
  claim: c.claim,
  value_json: c.value ?? null,
  source_json: c.sources ?? [],
  confidence: c.confidence,
  reasoning: c.reasoning ?? null,
  ...(c.created_at ? { created_at: c.created_at } : {}),
});

const noteFromRow = (r: Row): Note => ({
  id: r.id,
  lead_surface_id: r.lead_surface_id,
  agent_id: r.agent_id,
  body: r.body,
  modality: r.modality,
  situation: r.situation ?? undefined,
  created_at: r.created_at,
});

const artifactToRow = (a: Artifact): Row => ({
  id: a.id,
  agent_id: a.agent_id,
  lead_surface_id: a.lead_surface_id ?? null,
  loop_run_id: a.loop_run_id ?? null,
  type: a.type,
  status: a.status,
  payload_json: a.payload,
  evidence_used: a.evidence_used,
  compliance_result: a.compliance_result,
  model_trace: a.model_trace,
  external_draft_ref: a.external_draft_ref ?? null,
  trace_id: a.trace_id ?? null,
  created_at: a.created_at,
  approved_at: a.approved_at ?? null,
  sent_at: a.sent_at ?? null,
  snooze_until: a.snooze_until ?? null,
  edit_history: a.edit_history ?? [],
});
const artifactFromRow = (r: Row): Artifact => ({
  id: r.id,
  agent_id: r.agent_id,
  lead_surface_id: r.lead_surface_id ?? undefined,
  loop_run_id: r.loop_run_id ?? undefined,
  type: r.type,
  status: r.status,
  payload: r.payload_json,
  evidence_used: r.evidence_used ?? [],
  compliance_result: r.compliance_result,
  model_trace: r.model_trace,
  external_draft_ref: r.external_draft_ref ?? undefined,
  trace_id: r.trace_id ?? undefined,
  created_at: r.created_at,
  approved_at: r.approved_at ?? undefined,
  sent_at: r.sent_at ?? undefined,
  snooze_until: r.snooze_until ?? undefined,
  edit_history: r.edit_history ?? undefined,
});

// Map a Partial<Artifact> patch to the columns it touches.
const artifactPatchToRow = (p: Partial<Artifact>): Row => {
  const row: Row = {};
  if (p.status !== undefined) row.status = p.status;
  if (p.payload !== undefined) row.payload_json = p.payload;
  if (p.evidence_used !== undefined) row.evidence_used = p.evidence_used;
  if (p.compliance_result !== undefined) row.compliance_result = p.compliance_result;
  if (p.model_trace !== undefined) row.model_trace = p.model_trace;
  if (p.external_draft_ref !== undefined) row.external_draft_ref = p.external_draft_ref;
  if (p.trace_id !== undefined) row.trace_id = p.trace_id;
  if (p.approved_at !== undefined) row.approved_at = p.approved_at;
  if (p.sent_at !== undefined) row.sent_at = p.sent_at;
  if (p.snooze_until !== undefined) row.snooze_until = p.snooze_until;
  if (p.edit_history !== undefined) row.edit_history = p.edit_history;
  return row;
};

const eventToRow = (e: DomainEvent): Row => ({
  id: e.id,
  agent_id: e.agent_id,
  lead_surface_id: e.lead_surface_id ?? null,
  type: e.type,
  payload: e.payload,
  source: e.source,
  created_at: e.created_at,
});
const eventFromRow = (r: Row): DomainEvent => ({
  id: r.id,
  agent_id: r.agent_id,
  lead_surface_id: r.lead_surface_id ?? undefined,
  type: r.type,
  payload: r.payload ?? {},
  source: r.source,
  created_at: r.created_at,
});

const loopDefToRow = (d: LoopDefinition): Row => ({
  id: toUuid(d.id),
  agent_id: d.agent_id,
  name: d.name,
  description: d.description,
  trigger_json: d.trigger,
  conditions_json: d.conditions,
  actions_json: d.actions,
  cadence_json: d.cadence ?? null,
  active: d.active,
  stats_json: d.stats ?? { runs: 0, approved: 0, replies: 0, blocked: 0 },
  created_at: d.created_at,
});
const loopDefFromRow = (r: Row): LoopDefinition => ({
  id: r.id,
  agent_id: r.agent_id,
  name: r.name,
  description: r.description ?? "",
  trigger: r.trigger_json,
  conditions: r.conditions_json ?? [],
  actions: r.actions_json ?? [],
  cadence: r.cadence_json ?? undefined,
  active: r.active,
  created_at: r.created_at,
  stats: r.stats_json ?? undefined,
});

const loopRunToRow = (r: LoopRun): Row => ({
  id: r.id,
  loop_definition_id: toUuid(r.loop_definition_id),
  agent_id: r.agent_id,
  lead_surface_id: r.lead_surface_id ?? null,
  status: r.status,
  planner_trace: r.planner_trace,
  artifact_ids: r.artifact_ids,
  started_at: r.started_at,
  completed_at: r.completed_at ?? null,
});
const loopRunFromRow = (r: Row): LoopRun => ({
  id: r.id,
  loop_definition_id: r.loop_definition_id,
  agent_id: r.agent_id,
  lead_surface_id: r.lead_surface_id ?? undefined,
  status: r.status,
  planner_trace: r.planner_trace ?? [],
  artifact_ids: r.artifact_ids ?? [],
  started_at: r.started_at,
  completed_at: r.completed_at ?? undefined,
});

const watcherToRow = (w: Watcher): Row => ({
  id: toUuid(w.id),
  agent_id: w.agent_id,
  name: w.name,
  criteria_json: w.criteria,
  area_label: w.area_label,
  last_run_at: w.last_run_at ?? null,
  active: w.active,
  hits: w.hits,
});
const watcherFromRow = (r: Row): Watcher => ({
  id: r.id,
  agent_id: r.agent_id,
  name: r.name,
  criteria: r.criteria_json,
  area_label: r.area_label ?? "",
  last_run_at: r.last_run_at ?? undefined,
  active: r.active,
  hits: r.hits ?? 0,
});

const traceToRow = (t: AgentTrace): Row => ({
  id: t.id,
  agent_id: t.agent_id,
  artifact_id: t.artifact_id ?? null,
  loop_run_id: t.loop_run_id ?? null,
  trigger: t.trigger,
  situation: t.situation ?? null,
  situation_confidence: t.situationConfidence ?? null,
  evidence_used: t.evidenceUsed,
  excluded: t.excluded,
  policy: t.policy,
  connector: t.connector ?? null,
  cost: t.cost,
  created_at: t.created_at,
});
const traceFromRow = (r: Row): AgentTrace => ({
  id: r.id,
  agent_id: r.agent_id,
  artifact_id: r.artifact_id ?? undefined,
  loop_run_id: r.loop_run_id ?? undefined,
  trigger: r.trigger,
  situation: r.situation ?? undefined,
  situationConfidence: r.situation_confidence ?? undefined,
  evidenceUsed: r.evidence_used ?? [],
  excluded: r.excluded ?? [],
  policy: r.policy ?? [],
  connector: r.connector ?? undefined,
  cost: r.cost ?? { claudeCalls: 0, paidDataCalls: 0, ms: 0 },
  created_at: r.created_at,
});

const connectorToRow = (a: ConnectorAccount): Row => ({
  id: toUuid(a.id),
  agent_id: a.agent_id,
  provider: a.provider,
  scopes: a.scopes,
  status: a.status,
  credentials_ref: a.credentials_ref,
  capabilities: a.capabilities,
  last_healthcheck_at: a.last_healthcheck_at ?? null,
  created_at: a.created_at,
});
const connectorFromRow = (r: Row): ConnectorAccount => ({
  id: r.id,
  agent_id: r.agent_id,
  provider: r.provider as ConnectorProvider,
  scopes: r.scopes ?? [],
  status: r.status,
  credentials_ref: r.credentials_ref,
  capabilities: r.capabilities ?? [],
  last_healthcheck_at: r.last_healthcheck_at ?? undefined,
  created_at: r.created_at,
});

const reportToRow = (r: WeeklyReport): Row => ({
  id: r.id,
  agent_id: r.agent_id,
  period_start: r.periodStart,
  period_end: r.periodEnd,
  metrics_json: r.metrics,
  insights_json: r.whatChanged,
  recs_json: r.recommendations,
  generated_at: r.generated_at,
});
const reportFromRow = (r: Row): WeeklyReport => ({
  id: r.id,
  agent_id: r.agent_id,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  metrics: r.metrics_json,
  whatChanged: r.insights_json ?? [],
  recommendations: r.recs_json ?? [],
  generated_at: r.generated_at,
});

// ---- The repository ---------------------------------------------------------

export class SupabaseRepository implements Repository {
  private sb: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.sb = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // agents
  async getAgent(id: string) {
    const data = unwrap(
      await this.sb.from("agent").select("*").eq("id", id).maybeSingle(),
    );
    return data ? agentFromRow(data) : null;
  }
  async upsertAgent(agent: Agent) {
    unwrap(await this.sb.from("agent").upsert(agentToRow(agent)).select().single());
    return agent;
  }

  // lead surfaces
  async getLead(id: string) {
    const data = unwrap(
      await this.sb.from("lead_surface").select("*, lng, lat").eq("id", id).maybeSingle(),
    );
    return data ? leadFromRow(data) : null;
  }
  async listLeads(agentId: string) {
    const data = unwrap(
      await this.sb.from("lead_surface").select("*, lng, lat").eq("agent_id", agentId),
    );
    return (data ?? []).map(leadFromRow);
  }
  async upsertLead(lead: LeadSurface) {
    unwrap(
      await this.sb.rpc("fl_upsert_lead_surface", {
        p_id: lead.id,
        p_agent_id: lead.agent_id,
        p_lng: lead.lng,
        p_lat: lead.lat,
        p_address: lead.address,
        p_locality: lead.locality ?? null,
        p_h3: lead.h3_index,
        p_status: lead.status,
        p_label: lead.label ?? null,
        p_contact: lead.contact ?? null,
        p_first_seen: lead.first_seen_at,
        p_last_worked: lead.last_worked_at,
      }),
    );
    return lead;
  }
  async findLeadByAddress(agentId: string, address: string) {
    const data = unwrap(
      await this.sb
        .from("lead_surface")
        .select("*, lng, lat")
        .eq("agent_id", agentId)
        .ilike("address", address.trim())
        .limit(1),
    );
    return data && data.length ? leadFromRow(data[0]) : null;
  }

  // evidence
  async saveEvidence(leadId: string, cards: EvidenceCard[]) {
    // Replace semantics, matching the in-memory repo.
    unwrap(await this.sb.from("evidence_card").delete().eq("lead_surface_id", leadId).select());
    if (!cards.length) return;
    const rows = cards.map((c) => evidenceToRow(leadId, c));
    unwrap(await this.sb.from("evidence_card").insert(rows).select());
  }
  async listEvidence(leadId: string) {
    const data = unwrap(
      await this.sb
        .from("evidence_card")
        .select("*")
        .eq("lead_surface_id", leadId)
        .order("created_at", { ascending: true }),
    );
    return (data ?? []).map(evidenceFromRow);
  }

  // notes
  async addNote(note: Note) {
    unwrap(
      await this.sb
        .from("note")
        .insert({
          id: note.id,
          lead_surface_id: note.lead_surface_id,
          agent_id: note.agent_id,
          body: note.body,
          modality: note.modality,
          situation: note.situation ?? null,
          created_at: note.created_at,
        })
        .select(),
    );
    return note;
  }
  async listNotes(leadId: string) {
    const data = unwrap(
      await this.sb
        .from("note")
        .select("*")
        .eq("lead_surface_id", leadId)
        .order("created_at", { ascending: true }),
    );
    return (data ?? []).map(noteFromRow);
  }

  // artifacts
  async saveArtifact(a: Artifact) {
    unwrap(await this.sb.from("artifact").upsert(artifactToRow(a)).select());
    return a;
  }
  async getArtifact(id: string) {
    const data = unwrap(
      await this.sb.from("artifact").select("*").eq("id", id).maybeSingle(),
    );
    return data ? artifactFromRow(data) : null;
  }
  async updateArtifact(id: string, patch: Partial<Artifact>) {
    const row = artifactPatchToRow(patch);
    if (Object.keys(row).length === 0) return this.getArtifact(id);
    const data = unwrap(
      await this.sb.from("artifact").update(row).eq("id", id).select().maybeSingle(),
    );
    return data ? artifactFromRow(data) : null;
  }
  async listArtifacts(agentId: string) {
    const data = unwrap(
      await this.sb
        .from("artifact")
        .select("*")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false }),
    );
    return (data ?? []).map(artifactFromRow);
  }

  // domain events
  async appendEvent(e: DomainEvent) {
    unwrap(await this.sb.from("domain_event").insert(eventToRow(e)).select());
    return e;
  }
  async listEvents(agentId: string) {
    const data = unwrap(
      await this.sb
        .from("domain_event")
        .select("*")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: true }),
    );
    return (data ?? []).map(eventFromRow);
  }

  // loops
  async listLoopDefs(agentId: string) {
    const data = unwrap(
      await this.sb.from("loop_definition").select("*").eq("agent_id", agentId),
    );
    return (data ?? []).map(loopDefFromRow);
  }
  async getLoopDef(id: string) {
    const data = unwrap(
      await this.sb
        .from("loop_definition")
        .select("*")
        .eq("id", toUuid(id))
        .maybeSingle(),
    );
    return data ? loopDefFromRow(data) : null;
  }
  async upsertLoopDef(def: LoopDefinition) {
    unwrap(await this.sb.from("loop_definition").upsert(loopDefToRow(def)).select());
    return def;
  }
  async saveLoopRun(run: LoopRun) {
    unwrap(await this.sb.from("loop_run").upsert(loopRunToRow(run)).select());
    return run;
  }
  async listLoopRuns(agentId: string) {
    const data = unwrap(
      await this.sb
        .from("loop_run")
        .select("*")
        .eq("agent_id", agentId)
        .order("started_at", { ascending: false }),
    );
    return (data ?? []).map(loopRunFromRow);
  }

  // watchers
  async listWatchers(agentId: string) {
    const data = unwrap(
      await this.sb.from("watcher").select("*").eq("agent_id", agentId),
    );
    return (data ?? []).map(watcherFromRow);
  }
  async upsertWatcher(w: Watcher) {
    unwrap(await this.sb.from("watcher").upsert(watcherToRow(w)).select());
    return w;
  }

  // traces
  async saveTrace(t: AgentTrace) {
    unwrap(await this.sb.from("agent_trace").upsert(traceToRow(t)).select());
    return t;
  }
  async getTrace(id: string) {
    const data = unwrap(
      await this.sb.from("agent_trace").select("*").eq("id", id).maybeSingle(),
    );
    return data ? traceFromRow(data) : null;
  }
  async getTraceForArtifact(artifactId: string) {
    const data = unwrap(
      await this.sb
        .from("agent_trace")
        .select("*")
        .eq("artifact_id", artifactId)
        .limit(1),
    );
    return data && data.length ? traceFromRow(data[0]) : null;
  }

  // reports
  async saveReport(r: WeeklyReport) {
    unwrap(await this.sb.from("report").upsert(reportToRow(r)).select());
    return r;
  }
  async listReports(agentId: string) {
    const data = unwrap(
      await this.sb
        .from("report")
        .select("*")
        .eq("agent_id", agentId)
        .order("generated_at", { ascending: false }),
    );
    return (data ?? []).map(reportFromRow);
  }

  // memories (lead-scoped recall)
  async saveMemory(m: Memory) {
    const row: Row = {
      id: m.id,
      agent_id: m.agent_id,
      lead_surface_id: m.lead_surface_id,
      kind: m.kind,
      text: m.text,
      ref: m.ref ?? null,
      confidence: m.confidence ?? null,
      embedding: m.embedding,
      created_at: m.created_at,
    };
    // Keep ordinary lead-scoped memory compatible while the optional
    // neighborhood migration rolls out. Neighborhood writes still require it.
    if (m.h3_index !== undefined) row.h3_index = m.h3_index;
    unwrap(
      await this.sb
        .from("memory")
        .insert(row)
        .select(),
    );
    return m;
  }
  async listOutcomeMemories(leadId: string) {
    const data = unwrap(
      await this.sb
        .from("memory")
        .select("*")
        .eq("lead_surface_id", leadId)
        .eq("kind", "outcome")
        .order("created_at", { ascending: false }),
    );
    return ((data ?? []) as Row[]).map<Memory>((r) => ({
      id: r.id,
      agent_id: r.agent_id,
      lead_surface_id: r.lead_surface_id,
      kind: "outcome",
      text: r.text,
      ref: r.ref ?? undefined,
      confidence: (r.confidence as Confidence) ?? undefined,
      embedding: Array.isArray(r.embedding) ? r.embedding : [],
      created_at: r.created_at,
    }));
  }
  async recallNeighborhood(agentId: string, h3Index: string, k: number) {
    // Neighborhood recall is a simple table scan filtered by (agent, h3, kind).
    // No similarity score needed — every match is on-cell by definition. RLS
    // gates by agent at the DB layer; we double-check on the .eq() chain.
    const data = unwrap(
      await this.sb
        .from("memory")
        .select("*")
        .eq("agent_id", agentId)
        .eq("kind", "neighborhood")
        .eq("h3_index", h3Index)
        .order("created_at", { ascending: false })
        .limit(Math.max(1, k)),
    );
    return ((data ?? []) as Row[]).map<MemoryHit>((r) => ({
      memory: {
        id: r.id,
        agent_id: r.agent_id,
        lead_surface_id: r.lead_surface_id,
        kind: r.kind as MemoryKind,
        text: r.text,
        ref: r.ref ?? undefined,
        confidence: (r.confidence as Confidence) ?? undefined,
        h3_index: r.h3_index ?? undefined,
        embedding: Array.isArray(r.embedding) ? r.embedding : [],
        created_at: r.created_at,
      },
      similarity: 1,
    }));
  }
  async recallMemories(leadId: string, query: number[], k: number) {
    const data = unwrap(
      await this.sb.rpc("fl_recall_memories", {
        p_lead_id: leadId,
        p_query: query,
        p_k: k,
      }),
    );
    return ((data ?? []) as Row[]).map<MemoryHit>((r) => ({
      memory: {
        id: r.id,
        agent_id: r.agent_id,
        lead_surface_id: r.lead_surface_id,
        kind: r.kind as MemoryKind,
        text: r.text,
        ref: r.ref ?? undefined,
        confidence: (r.confidence as Confidence) ?? undefined,
        h3_index: r.h3_index ?? undefined,
        embedding: Array.isArray(r.embedding) ? r.embedding : [],
        created_at: r.created_at,
      },
      similarity: Number(r.similarity ?? 0),
    }));
  }

  // connector accounts
  async listConnectorAccounts(agentId: string) {
    const data = unwrap(
      await this.sb.from("connector_account").select("*").eq("agent_id", agentId),
    );
    return (data ?? []).map(connectorFromRow);
  }
  async upsertConnectorAccount(a: ConnectorAccount) {
    unwrap(
      await this.sb
        .from("connector_account")
        .upsert(connectorToRow(a), { onConflict: "agent_id,provider" })
        .select(),
    );
    return a;
  }
}
