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
import { runScout, runScoutCached } from "@/lib/agents/scouts";
import { reduce } from "@/lib/agents/reducer";
import {
  persistEvidenceMemory,
  persistEventMemory,
  persistNeighborhoodMemory,
  persistOutcomeMemory,
  recallForLead,
  recallNeighborhood,
  renderNeighborhoodNote,
  recallOutcomes,
  renderRecallNote,
  summarizeOutcomes,
} from "@/lib/agents/memory";
import { composeBest } from "@/lib/agents/composer";
import { config } from "@/lib/core/config";
import { lintArtifactText } from "@/lib/agents/compliance";
import { buildTrace } from "@/lib/agents/trace";
import { connectorForAction } from "@/lib/connectors";
import { getRepo } from "@/lib/db";
import { log } from "@/lib/observability";

// ---- Events -----------------------------------------------------------------

export async function emit(
  agentId: string,
  type: DomainEventType,
  payload: Record<string, unknown>,
  source: string,
  leadId?: string,
  idempotencyKeyValue?: string,
): Promise<DomainEvent> {
  const repo = await getRepo();
  if (idempotencyKeyValue) {
    const prior = await repo.getEventByIdempotencyKey(agentId, idempotencyKeyValue);
    if (prior) return prior;
  }
  const event = await repo.appendEvent({
    id: uuid(),
    agent_id: agentId,
    lead_surface_id: leadId,
    type,
    payload,
    source,
    idempotency_key: idempotencyKeyValue,
    created_at: nowISO(),
  });
  if (["artifact.edited", "artifact.approved", "artifact.sent", "email.reply"].includes(type)) {
    await persistEventMemory(event).catch(() => null);
  }
  return event;
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

export async function runSwarm(lead: LeadSurface): Promise<SwarmResult> {
  const repo = await getRepo();
  const started = Date.now();
  await emit(lead.agent_id, "lead.tapped", { address: lead.address, status: lead.status }, "pipeline", lead.id);

  // Lead-scoped recall BEFORE we spend any scout budget. The address +
  // locality is a stable, scope-faithful query string for the property/risk
  // facts the dispatcher would otherwise re-research.
  const recall = await recallForLead(
    lead,
    `${lead.address}${lead.locality ? ", " + lead.locality : ""}`,
  );

  // Observability: a silent recall is an unverifiable recall. Emit a structured
  // log AND a domain event whenever recall returns hits, so prod traffic proves
  // the path actually fires and the Agent Trace shows it for any tap.
  if (recall.hits.length > 0) {
    log("info", "recall.fired", {
      leadId: lead.id,
      hits: recall.hits.length,
      priorGrounded: recall.priorGroundedCount,
      sufficient: recall.sufficient,
    });
    await emit(
      lead.agent_id,
      "memory.recalled",
      {
        hits: recall.hits.length,
        priorGrounded: recall.priorGroundedCount,
        sufficient: recall.sufficient,
        refs: recall.refs,
      },
      "memory",
      lead.id,
    );
  }

  const plan = await planDispatch({
    lng: lead.lng,
    lat: lead.lat,
    address: lead.address,
    status: lead.status,
    priorMemoryRefs: recall.refs,
    priorGroundedCount: recall.priorGroundedCount,
  });

  // Fan out in parallel — bounded by the dispatcher to <= 5.
  const scoutResults = await Promise.all(
    plan.scouts.map((job) => runScoutCached({ lng: lead.lng, lat: lead.lat, address: lead.address, job }))
  );

  let reduced = reduce(scoutResults, Date.now() - started);
  if (reduced.summary.breakout?.kind === "deeper_scout") {
    const target = reduced.summary.breakout.target;
    const targetCard = reduced.summary.cards.find((card) => card.claim === target);
    const originalJob = plan.scouts.find((job) => job.type === targetCard?.scout);
    if (originalJob) {
      const deeper = await runScout({
        lng: lead.lng,
        lat: lead.lat,
        address: lead.address,
        job: {
          ...originalJob,
          why: `Single depth-one breakout for conflicting claim: ${target}`,
          budget: {
            maxCalls: originalJob.budget.maxCalls + 1,
            maxMs: Math.round(originalJob.budget.maxMs * 1.5),
            maxTokens: Math.round(originalJob.budget.maxTokens * 1.5),
          },
        },
      });
      scoutResults.push(deeper);
      reduced = reduce(scoutResults, Date.now() - started);
      if (reduced.summary.breakout?.kind === "deeper_scout") {
        reduced.summary.breakout = {
          kind: "ask_human",
          target,
          question: `Sources still conflict on "${target}". Can you confirm the correct value?`,
          reason: "The single permitted deeper scout did not resolve the conflict.",
        };
      }
    }
  }
  const { summary, rejected } = reduced;
  await repo.saveEvidence(lead.id, summary.cards);

  // Persist every reduced card for lead-scoped recall. The neighborhood writer
  // independently accepts only transferable A/B area facts.
  for (const card of summary.cards) {
    await persistEvidenceMemory(lead.agent_id, lead, card);
    await persistNeighborhoodMemory(lead.agent_id, lead, card);
  }

  // Cross-lead area recall. Privacy: agent-scoped and market-only.
  const neighborhood = lead.h3_index
    ? await recallNeighborhood(lead.agent_id, lead.h3_index)
    : [];
  // Drop priors that came from this lead; this note is cross-lead context.
  const crossLeadPriors = neighborhood.filter(
    (h) => h.memory.lead_surface_id !== lead.id,
  );
  const neighborhoodCount = crossLeadPriors.length;
  const neighborhoodNote = renderNeighborhoodNote(neighborhoodCount);

  const recallNote = renderRecallNote(recall);
  // Project hits into a UI-safe shape (no embeddings) and sort newest-first
  // so the rail's expanded list reads top-down as "most recent prior signal".
  const recalledHits = recall.hits.length
    ? recall.hits
        .map((h) => ({
          memoryId: h.memory.id,
          kind: h.memory.kind,
          text: h.memory.text,
          confidence: h.memory.confidence,
          ref: h.memory.ref,
          createdAt: h.memory.created_at,
        }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    : undefined;
  const summaryWithRecall: ReduceSummary = {
    ...summary,
    ...(recallNote ? { recallNote } : {}),
    ...(recalledHits ? { recalledHits } : {}),
    ...(neighborhoodCount > 0 ? { neighborhoodPriors: neighborhoodCount } : {}),
    ...(neighborhoodNote ? { neighborhoodNote } : {}),
  };

  const updated = { ...lead, status: lead.status === "new" ? "researching" : lead.status, last_worked_at: nowISO() } as LeadSurface;
  await repo.upsertLead(updated);

  return { lead: updated, summary: summaryWithRecall, rejected, scoutResults };
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

  // Outcome recall — what did the human ALREADY do with prior drafts for this
  // lead+actionType? Best-effort: if recall fails, draft with no prior context
  // rather than block. Composer takes the base template path when undefined.
  let priorOutcomes: import("@/lib/core/types").PriorOutcomeSummary | undefined;
  try {
    const memos = await recallOutcomes(lead, input.actionType);
    if (memos.length > 0) priorOutcomes = summarizeOutcomes(memos);
  } catch {
    priorOutcomes = undefined;
  }

  const composed = await composeBest({
    agent,
    situation: input.situation,
    actionType: input.actionType,
    address: lead.address,
    recipientLabel: lead.contact?.name ?? `Owner · ${lead.address}`,
    recipientEmail: lead.contact?.email,
    recipientPhone: lead.contact?.phone,
    evidence: input.evidence,
    priorOutcomes,
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
      tokens: composed.modelUsage
        ? composed.modelUsage.inputTokens + composed.modelUsage.outputTokens
        : undefined,
    },
    trace_id: traceId,
    revision: 1,
    created_at: nowISO(),
    updated_at: nowISO(),
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
    cost: {
      claudeCalls: isLive ? 1 : 0,
      paidDataCalls: 0,
      ms: 0,
      inputTokens: composed.modelUsage?.inputTokens,
      outputTokens: composed.modelUsage?.outputTokens,
      cacheReadTokens: composed.modelUsage?.cacheReadTokens,
      cacheWriteTokens: composed.modelUsage?.cacheWriteTokens,
      fallbackReason: composed.fallbackReason,
    },
    priorOutcomes,
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
  expectedRevision: number,
  opts?: { googleAccessToken?: string }
): Promise<ApproveResult | null> {
  const repo = await getRepo();
  const artifact = await repo.getArtifact(artifactId);
  if (!artifact) return null;
  if (artifact.revision !== expectedRevision) {
    throw new Error(
      `Artifact changed since review (expected revision ${expectedRevision}, current ${artifact.revision}).`
    );
  }

  // Fail-closed: a blocked artifact can never be approved/sent.
  if (artifact.status === "blocked" || !artifact.compliance_result.pass) {
    throw new Error("Cannot approve: compliance linter blocked this artifact.");
  }

  const connector = connectorForAction(artifact.type, opts);
  const key = idempotencyKey([
    artifact.id,
    String(artifact.revision),
    artifact.type,
    connector.provider,
  ]);
  const meta = { idempotencyKey: key, agentId: artifact.agent_id, leadSurfaceId: artifact.lead_surface_id };

  const durablePrior = await repo.getConnectorWrite(key);
  if (durablePrior) {
    return {
      artifact,
      connector: {
        provider: durablePrior.provider,
        ...durablePrior.result,
        deduped: true,
      },
    };
  }

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
  if (result.ok) {
    await repo.saveConnectorWrite({
      id: uuid(),
      agent_id: artifact.agent_id,
      artifact_id: artifact.id,
      provider: result.provider,
      idempotency_key: key,
      result: {
        ok: result.ok,
        externalId: result.externalId,
        url: result.url,
        deduped: result.deduped,
        mode: result.mode,
        error: result.error,
      },
      created_at: nowISO(),
    });
  }

  if (!result.ok) {
    throw new Error(
      `Connector write failed: ${result.error ?? `${result.provider} returned an unsuccessful result`}`,
    );
  }

  // Email drafts are "drafted in the user's tool" (sent=false); others are written.
  const isEmailDraft = artifact.type === "email";
  const updated = await repo.updateArtifact(artifact.id, {
    status: isEmailDraft ? "approved" : "sent",
    approved_at: nowISO(),
    approved_revision: artifact.revision,
    updated_at: nowISO(),
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

  // Outcome memory — best-effort. The composer next time can warn before
  // drafting a duplicate offer to this same lead.
  const latestEdit = artifact.edit_history?.at(-1);
  const editedExcerpt =
    latestEdit?.field === "body" ? latestEdit.after.slice(0, 240) : undefined;
  const verdict = editedExcerpt ? "edited" : "approved";
  const outcomeMem = await persistOutcomeMemory(
    updated!,
    verdict,
    editedExcerpt,
  );
  if (outcomeMem) {
    await emit(
      artifact.agent_id,
      "outcome.recorded",
      { verdict, artifactId: artifact.id, memoryId: outcomeMem.id },
      "memory",
      artifact.lead_surface_id,
    );
  }

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

// ---- Reject (the OTHER human gate) ------------------------------------------

export interface RejectResult {
  artifact: Artifact;
  memoryId?: string;
}

/** The human's "no" — write a `cancelled` artifact + outcome memory so the
 *  composer can adjust next time. Reason is free-text and optional. */
export async function rejectArtifact(
  artifactId: string,
  reason?: string,
): Promise<RejectResult | null> {
  const repo = await getRepo();
  const artifact = await repo.getArtifact(artifactId);
  if (!artifact) return null;
  // Idempotent: rejecting an already-cancelled artifact is a no-op.
  if (artifact.status === "cancelled") return { artifact };

  const updated = await repo.updateArtifact(artifact.id, {
    status: "cancelled",
  });

  await emit(
    artifact.agent_id,
    "artifact.cancelled",
    { artifactId: artifact.id, reason: reason ?? null },
    "pipeline",
    artifact.lead_surface_id,
  );

  const outcomeMem = await persistOutcomeMemory(
    updated!,
    "rejected",
    reason,
  );
  if (outcomeMem) {
    await emit(
      artifact.agent_id,
      "outcome.recorded",
      { verdict: "rejected", artifactId: artifact.id, memoryId: outcomeMem.id, reason: reason ?? null },
      "memory",
      artifact.lead_surface_id,
    );
  }

  return { artifact: updated!, memoryId: outcomeMem?.id };
}

function nextStatus(s: LeadStatus): LeadStatus {
  if (s === "new" || s === "researching") return "contacted";
  return s;
}
