// ============================================================================
// Repository — the persistence seam. Default is an in-memory store so the full
// product loop runs with zero external services; FORLEADS_PERSIST=supabase
// swaps in the Postgres-backed repo (supabase/migrations + RLS). The interface
// mirrors the tables in docs/Forleads_Architecture_v1.md §5 and
// _ProductionMarketPlan_ §5.
// ============================================================================

import type {
  Agent,
  AgentTrace,
  Artifact,
  ConnectorAccount,
  DomainEvent,
  EvidenceCard,
  LeadSurface,
  LoopDefinition,
  LoopRun,
  Memory,
  MemoryHit,
  Note,
  Watcher,
  WeeklyReport,
} from "@/lib/core/types";

import { cosineSimilarity } from "@/lib/agents/embedder";

export interface Repository {
  // agents
  getAgent(id: string): Promise<Agent | null>;
  upsertAgent(agent: Agent): Promise<Agent>;

  // lead surfaces
  getLead(id: string): Promise<LeadSurface | null>;
  listLeads(agentId: string): Promise<LeadSurface[]>;
  upsertLead(lead: LeadSurface): Promise<LeadSurface>;
  findLeadByAddress(agentId: string, address: string): Promise<LeadSurface | null>;

  // evidence
  saveEvidence(leadId: string, cards: EvidenceCard[]): Promise<void>;
  listEvidence(leadId: string): Promise<EvidenceCard[]>;

  // notes
  addNote(note: Note): Promise<Note>;
  listNotes(leadId: string): Promise<Note[]>;

  // artifacts
  saveArtifact(a: Artifact): Promise<Artifact>;
  getArtifact(id: string): Promise<Artifact | null>;
  updateArtifact(id: string, patch: Partial<Artifact>): Promise<Artifact | null>;
  listArtifacts(agentId: string): Promise<Artifact[]>;

  // domain events
  appendEvent(e: DomainEvent): Promise<DomainEvent>;
  listEvents(agentId: string): Promise<DomainEvent[]>;

  // loops
  listLoopDefs(agentId: string): Promise<LoopDefinition[]>;
  getLoopDef(id: string): Promise<LoopDefinition | null>;
  upsertLoopDef(def: LoopDefinition): Promise<LoopDefinition>;
  saveLoopRun(run: LoopRun): Promise<LoopRun>;
  listLoopRuns(agentId: string): Promise<LoopRun[]>;

  // watchers
  listWatchers(agentId: string): Promise<Watcher[]>;
  upsertWatcher(w: Watcher): Promise<Watcher>;

  // traces
  saveTrace(t: AgentTrace): Promise<AgentTrace>;
  getTrace(id: string): Promise<AgentTrace | null>;
  getTraceForArtifact(artifactId: string): Promise<AgentTrace | null>;

  // reports
  saveReport(r: WeeklyReport): Promise<WeeklyReport>;
  listReports(agentId: string): Promise<WeeklyReport[]>;

  // connector accounts
  listConnectorAccounts(agentId: string): Promise<ConnectorAccount[]>;
  upsertConnectorAccount(a: ConnectorAccount): Promise<ConnectorAccount>;

  // memories (lead-scoped recall)
  saveMemory(m: Memory): Promise<Memory>;
  recallMemories(leadId: string, query: number[], k: number): Promise<MemoryHit[]>;
  listOutcomeMemories(leadId: string): Promise<Memory[]>;
}

interface Store {
  agents: Map<string, Agent>;
  leads: Map<string, LeadSurface>;
  evidence: Map<string, EvidenceCard[]>;
  notes: Map<string, Note[]>;
  artifacts: Map<string, Artifact>;
  events: DomainEvent[];
  loopDefs: Map<string, LoopDefinition>;
  loopRuns: LoopRun[];
  watchers: Map<string, Watcher>;
  traces: Map<string, AgentTrace>;
  reports: WeeklyReport[];
  connectorAccounts: Map<string, ConnectorAccount>;
  memories: Map<string, Memory[]>; // keyed by lead_surface_id
}

export class InMemoryRepository implements Repository {
  constructor(private s: Store) {}

  async getAgent(id: string) {
    return this.s.agents.get(id) ?? null;
  }
  async upsertAgent(agent: Agent) {
    this.s.agents.set(agent.id, agent);
    return agent;
  }

  async getLead(id: string) {
    return this.s.leads.get(id) ?? null;
  }
  async listLeads(agentId: string) {
    return [...this.s.leads.values()].filter((l) => l.agent_id === agentId);
  }
  async upsertLead(lead: LeadSurface) {
    this.s.leads.set(lead.id, lead);
    return lead;
  }
  async findLeadByAddress(agentId: string, address: string) {
    const norm = address.toLowerCase().trim();
    return (
      [...this.s.leads.values()].find(
        (l) => l.agent_id === agentId && l.address.toLowerCase().trim() === norm
      ) ?? null
    );
  }

  async saveEvidence(leadId: string, cards: EvidenceCard[]) {
    this.s.evidence.set(leadId, cards);
  }
  async listEvidence(leadId: string) {
    return this.s.evidence.get(leadId) ?? [];
  }

  async addNote(note: Note) {
    const arr = this.s.notes.get(note.lead_surface_id) ?? [];
    arr.push(note);
    this.s.notes.set(note.lead_surface_id, arr);
    return note;
  }
  async listNotes(leadId: string) {
    return this.s.notes.get(leadId) ?? [];
  }

  async saveArtifact(a: Artifact) {
    this.s.artifacts.set(a.id, a);
    return a;
  }
  async getArtifact(id: string) {
    return this.s.artifacts.get(id) ?? null;
  }
  async updateArtifact(id: string, patch: Partial<Artifact>) {
    const cur = this.s.artifacts.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    this.s.artifacts.set(id, next);
    return next;
  }
  async listArtifacts(agentId: string) {
    return [...this.s.artifacts.values()]
      .filter((a) => a.agent_id === agentId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async appendEvent(e: DomainEvent) {
    this.s.events.push(e);
    return e;
  }
  async listEvents(agentId: string) {
    return this.s.events.filter((e) => e.agent_id === agentId);
  }

  async listLoopDefs(agentId: string) {
    return [...this.s.loopDefs.values()].filter((d) => d.agent_id === agentId);
  }
  async getLoopDef(id: string) {
    return this.s.loopDefs.get(id) ?? null;
  }
  async upsertLoopDef(def: LoopDefinition) {
    this.s.loopDefs.set(def.id, def);
    return def;
  }
  async saveLoopRun(run: LoopRun) {
    this.s.loopRuns.push(run);
    return run;
  }
  async listLoopRuns(agentId: string) {
    return this.s.loopRuns
      .filter((r) => r.agent_id === agentId)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
  }

  async listWatchers(agentId: string) {
    return [...this.s.watchers.values()].filter((w) => w.agent_id === agentId);
  }
  async upsertWatcher(w: Watcher) {
    this.s.watchers.set(w.id, w);
    return w;
  }

  async saveTrace(t: AgentTrace) {
    this.s.traces.set(t.id, t);
    return t;
  }
  async getTrace(id: string) {
    return this.s.traces.get(id) ?? null;
  }
  async getTraceForArtifact(artifactId: string) {
    return [...this.s.traces.values()].find((t) => t.artifact_id === artifactId) ?? null;
  }

  async saveReport(r: WeeklyReport) {
    this.s.reports.push(r);
    return r;
  }
  async listReports(agentId: string) {
    return this.s.reports.filter((r) => r.agent_id === agentId);
  }

  async listConnectorAccounts(agentId: string) {
    return [...this.s.connectorAccounts.values()].filter((a) => a.agent_id === agentId);
  }
  async upsertConnectorAccount(a: ConnectorAccount) {
    this.s.connectorAccounts.set(a.provider, a);
    return a;
  }

  async saveMemory(m: Memory) {
    const arr = this.s.memories.get(m.lead_surface_id) ?? [];
    arr.push(m);
    this.s.memories.set(m.lead_surface_id, arr);
    return m;
  }
  async recallMemories(leadId: string, query: number[], k: number) {
    const rows = this.s.memories.get(leadId) ?? [];
    return rows
      .map((memory) => ({ memory, similarity: cosineSimilarity(memory.embedding, query) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, Math.max(1, k));
  }
  async listOutcomeMemories(leadId: string) {
    return (this.s.memories.get(leadId) ?? [])
      .filter((m) => m.kind === "outcome")
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }
}

export function emptyStore(): Store {
  return {
    agents: new Map(),
    leads: new Map(),
    evidence: new Map(),
    notes: new Map(),
    artifacts: new Map(),
    events: [],
    loopDefs: new Map(),
    loopRuns: [],
    watchers: new Map(),
    traces: new Map(),
    reports: [],
    connectorAccounts: new Map(),
    memories: new Map(),
  };
}
