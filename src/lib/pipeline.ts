// ============================================================================
// Pipeline — the orchestration that runs the magic loop end to end:
//   swarm: dispatch → scouts (parallel, bounded) → reduce → persist evidence
//   draft: compose → compliance lint → persist artifact + Agent Trace
//   approve: human gate → idempotent connector write → log event + trace
// (docs/Forleads_Architecture_v1.md §6, _AgentLoops_, _ProductionMarketPlan_).
// ============================================================================

import { nowISO, uuid, idempotencyKey } from "@/lib/core/ids";
import { h3Key } from "@/lib/core/geo";
import type {
  ActionType,
  Agent,
  Artifact,
  DomainEvent,
  DomainEventType,
  EvidenceCard,
  LeadStatus,
  LeadSurface,
  ReduceSummary,
  ScoutResult,
  Situation,
} from "@/lib/core/types";
import { planDispatch } from "@/lib/agents/dispatcher";
import { runScoutCached } from "@/lib/agents/scouts";
import { reduce } from "@/lib/agents/reducer";
import { composeBest } from "@/lib/agents/composer";
import { config } from "@/lib/core/config";
import { lintArtifactText } from "@/lib/agents/compliance";
import { buildTrace } from "@/lib/agents/trace";
import { connectorForAction } from "@/lib/connectors";
import { getRepo } from "@/lib/db";

// ---- Events -----------------------------------------------------------------

export async function emit(
  agentId: string,
  type: DomainEventType,
  payload: Record<string, unknown>,
  source: string,
  leadId?: string
): Promise<DomainEvent> {
  const repo = await getRepo();
  return repo.appendEvent({
    id: uuid(),
    agent_id: agentId,
    lead_surface_id: leadId,
    type,
    payload,
    source,
    created_at: nowISO(),
  });
}

// ---- Lead creation / lookup -------------------------------------------------

export async function ensureLead(
  agentId: string,
  input: { address: string; lng: number; lat: number; locality?: string }
): Promise<LeadSurface> {
  const repo = await getRepo();
  const existing = await repo.findLeadByAddress(agentId, input.address);
  if (existing) return existing;
  const lead: LeadSurface = {
    id: uuid(),
    agent_id: agentId,
    address: input.address,
    locality: input.locality,
    lng: input.lng,
    lat: input.lat,
    h3_index: h3Key(input.lng, input.lat),
    status: "researching",
    contact: { email: "owner@example.com" }, // mock contact channel so the loop runs
    first_seen_at: nowISO(),
    last_worked_at: nowISO(),
  };
  await repo.upsertLead(lead);
  await emit(agentId, "lead.created", { address: lead.address }, "pipeline", lead.id);
  return lead;
}

// ---- Swarm ------------------------------------------------------------------

export interface SwarmResult {
  lead: LeadSurface;
  summary: ReduceSummary;
  rejected: { card: EvidenceCard; errors: string[] }[];
  scoutResults: ScoutResult[];
}

export function buildDegradedLeadSummary(
  lead: Pick<LeadSurface, "address" | "locality">,
  reason: string
): ReduceSummary {
  return {
    cards: [
      {
        scout: "property",
        claim: "Lead surface",
        value: lead.locality ?? lead.address,
        sources: [{ name: "Operator search" }],
        confidence: "B",
        reasoning:
          "The lead was captured from the operator's typed search so the workflow can keep moving while scouts recover.",
      },
      {
        scout: "market",
        claim: "Scout pass",
        value: null,
        sources: [],
        confidence: "D",
        reasoning: reason,
      },
    ],
    grade: "D",
    gaps: [reason],
    breakout: {
      kind: "ask_human",
      target: "Scout pass",
      question: "Retry the scout pass now, or continue manually with a field note?",
      reason: "The lead exists, but the scouting pass degraded before it could finish.",
    },
    scoutCount: 0,
    elapsedMs: 0,
  };
}

export async function runSwarm(lead: LeadSurface): Promise<SwarmResult> {
  const repo = await getRepo();
  const started = Date.now();
  await emit(lead.agent_id, "lead.tapped", { address: lead.address, status: lead.status }, "pipeline", lead.id);

  const plan = await planDispatch({
    lng: lead.lng,
    lat: lead.lat,
    address: lead.address,
    status: lead.status,
  });

  // Fan out in parallel — bounded by the dispatcher to <= 5.
  const scoutResults = await Promise.all(
    plan.scouts.map((job) => runScoutCached({ lng: lead.lng, lat: lead.lat, address: lead.address, job }))
  );

  const { summary, rejected } = reduce(scoutResults, Date.now() - started);
  await repo.saveEvidence(lead.id, summary.cards);

  const updated = { ...lead, status: lead.status === "new" ? "researching" : lead.status, last_worked_at: nowISO() } as LeadSurface;
  await repo.upsertLead(updated);

  return { lead: updated, summary, rejected, scoutResults };
}

// ---- Draft ------------------------------------------------------------------

export interface DraftInput {
  agent: Agent;
  lead: LeadSurface;
  situation: Situation;
  situationConfidence: number;
  actionType: ActionType;
  evidence: EvidenceCard[];
  loopRunId?: string;
  trigger: string;
}

export async function draftArtifact(input: DraftInput): Promise<Artifact> {
  const repo = await getRepo();
  const { agent, lead } = input;

  const composed = await composeBest({
    agent,
    situation: input.situation,
    actionType: input.actionType,
    address: lead.address,
    recipientLabel: lead.contact?.name ?? `Owner · ${lead.address}`,
    recipientEmail: lead.contact?.email,
    recipientPhone: lead.contact?.phone,
    evidence: input.evidence,
  });

  // Compliance lint the human-visible text (fail-closed).
  const textParts: (string | undefined)[] = [];
  const p = composed.payload as unknown as Record<string, unknown>;
  if ("subject" in p) textParts.push(String(p.subject));
  if ("body" in p) textParts.push(String(p.body));
  if ("title" in p) textParts.push(String(p.title));
  if ("notes" in p) textParts.push(String(p.notes));
  const compliance = lintArtifactText(textParts);

  // A live draft is tagged by its prompt version; reflect that in the trace.
  const isLive = composed.promptVersion.startsWith("composer-live");

  const artifactId = uuid();
  const traceId = uuid();

  const artifact: Artifact = {
    id: artifactId,
    agent_id: agent.id,
    lead_surface_id: lead.id,
    loop_run_id: input.loopRunId,
    type: input.actionType,
    status: compliance.pass ? "drafted" : "blocked",
    payload: composed.payload,
    evidence_used: composed.evidenceUsed,
    compliance_result: compliance,
    model_trace: {
      model: isLive ? config.claudeModel : "deterministic-composer",
      promptVersion: composed.promptVersion,
      mode: isLive ? "live" : "mock",
    },
    trace_id: traceId,
    created_at: nowISO(),
  };
  await repo.saveArtifact(artifact);

  const trace = buildTrace({
    agentId: agent.id,
    artifact,
    loopRunId: input.loopRunId,
    trigger: input.trigger,
    situation: input.situation,
    situationConfidence: input.situationConfidence,
    evidenceUsed: composed.evidenceUsed,
    excluded: composed.excluded,
    compliance,
    cost: { claudeCalls: isLive ? 1 : 0, paidDataCalls: 0, ms: 0 },
  });
  // Bind the trace's id to the one referenced by the artifact.
  trace.id = traceId;
  await repo.saveTrace(trace);

  await emit(
    agent.id,
    compliance.pass ? "artifact.drafted" : "artifact.blocked",
    { artifactId, type: input.actionType, situation: input.situation },
    "pipeline",
    lead.id
  );

  return artifact;
}

// ---- Approve (human gate) ---------------------------------------------------

export interface ApproveResult {
  artifact: Artifact;
  connector: { provider: string; externalId?: string; url?: string; deduped: boolean; mode: string; ok: boolean; error?: string };
}

export async function approveArtifact(
  artifactId: string,
  opts?: { googleAccessToken?: string }
): Promise<ApproveResult | null> {
  const repo = await getRepo();
  const artifact = await repo.getArtifact(artifactId);
  if (!artifact) return null;

  // Fail-closed: a blocked artifact can never be approved/sent.
  if (artifact.status === "blocked" || !artifact.compliance_result.pass) {
    throw new Error("Cannot approve: compliance linter blocked this artifact.");
  }

  const connector = connectorForAction(artifact.type, opts);
  const key = idempotencyKey([artifact.id, artifact.type, connector.provider]);
  const meta = { idempotencyKey: key, agentId: artifact.agent_id, leadSurfaceId: artifact.lead_surface_id };

  // Route to the right connector method by action type.
  let result;
  switch (artifact.type) {
    case "email":
      result = await connector.createDraft(artifact.payload as never, meta);
      break;
    case "calendar":
      result = await connector.createCalendarEvent(artifact.payload as never, meta);
      break;
    case "sms":
      result = connector.sendSms
        ? await connector.sendSms(artifact.payload as never, meta)
        : { ok: false, provider: connector.provider, idempotencyKey: key, deduped: false, mode: connector.mode, error: "no sms" };
      break;
    case "task":
      result = await connector.createTask(artifact.payload as never, meta);
      break;
    case "crm_note":
    default:
      result = await connector.writeCrmNote(artifact.payload as never, meta);
      break;
  }

  // Email drafts are "drafted in the user's tool" (sent=false); others are written.
  const isEmailDraft = artifact.type === "email";
  const updated = await repo.updateArtifact(artifact.id, {
    status: isEmailDraft ? "approved" : "sent",
    approved_at: nowISO(),
    sent_at: isEmailDraft ? undefined : nowISO(),
    external_draft_ref: result.externalId
      ? { provider: result.provider, externalId: result.externalId, url: result.url, idempotencyKey: key }
      : undefined,
  });

  // Update the trace's connector record.
  const trace = await repo.getTraceForArtifact(artifact.id);
  if (trace) {
    trace.connector = {
      provider: result.provider,
      action: artifact.type,
      idempotencyKey: key,
      sent: !isEmailDraft,
    };
    await repo.saveTrace(trace);
  }

  await emit(
    artifact.agent_id,
    "artifact.approved",
    { artifactId: artifact.id, provider: result.provider, deduped: result.deduped },
    "pipeline",
    artifact.lead_surface_id
  );
  await emit(artifact.agent_id, "connector.write", { provider: result.provider, idempotencyKey: key, ok: result.ok }, "connector", artifact.lead_surface_id);

  // Advance the lead's status to contacted.
  if (artifact.lead_surface_id) {
    const lead = await repo.getLead(artifact.lead_surface_id);
    if (lead) await repo.upsertLead({ ...lead, status: nextStatus(lead.status), last_worked_at: nowISO() });
  }

  return {
    artifact: updated!,
    connector: {
      provider: result.provider,
      externalId: result.externalId,
      url: result.url,
      deduped: result.deduped,
      mode: result.mode,
      ok: result.ok,
      error: result.error,
    },
  };
}

function nextStatus(s: LeadStatus): LeadStatus {
  if (s === "new" || s === "researching") return "contacted";
  return s;
}
