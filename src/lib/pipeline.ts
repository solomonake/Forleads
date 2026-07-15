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
  ComplianceResult,
  DomainEvent,
  DomainEventType,
  EvidenceCard,
  LeadStatus,
  LeadSurface,
  ReduceSummary,
  ScoutResult,
  ScoutType,
  Situation,
  ReviewedConnectorBinding,
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
import type { ConnectorResult } from "@/lib/connectors/types";
import { getRepo, type Repository } from "@/lib/db";
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
  const event: DomainEvent = {
    id: uuid(),
    agent_id: agentId,
    lead_surface_id: leadId,
    type,
    payload,
    source,
    idempotency_key: idempotencyKeyValue,
    created_at: nowISO(),
  };
  if (idempotencyKeyValue) {
    const prior = await repo.getEventByIdempotencyKey(agentId, idempotencyKeyValue);
    if (prior) return prior;
    const claimed = await repo.claimEvent(event);
    if (!claimed) {
      return (await repo.getEventByIdempotencyKey(agentId, idempotencyKeyValue)) ?? event;
    }
  } else {
    await repo.appendEvent(event);
  }
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

  // Cross-lead H3-cell recall — compute the SET of scout types that already
  // have an A/B-grade fact on this block from a sibling lead. The dispatcher
  // uses it to skip redundant scouts. We do this BEFORE the swarm so the
  // skipped scouts never run.
  const neighborhoodHits = lead.h3_index
    ? await recallNeighborhood(lead.agent_id, lead.h3_index)
    : [];
  const siblingHits = neighborhoodHits.filter(
    (h) => h.memory.lead_surface_id !== lead.id,
  );
  const neighborhoodCoveredScouts: ScoutType[] = [];
  for (const h of siblingHits) {
    // Parse the scout tag from the stored surface form ("[<scout>/<grade>] …").
    const m = /^\[([a-z]+)\/([A-D])\]/.exec(h.memory.text);
    if (!m) continue;
    if (m[2] !== "A" && m[2] !== "B") continue;
    const scoutType = m[1] as ScoutType;
    if (!neighborhoodCoveredScouts.includes(scoutType)) {
      neighborhoodCoveredScouts.push(scoutType);
    }
  }

  const plan = await planDispatch({
    lng: lead.lng,
    lat: lead.lat,
    address: lead.address,
    status: lead.status,
    priorMemoryRefs: recall.refs,
    priorGroundedCount: recall.priorGroundedCount,
    neighborhoodCoveredScouts,
  });

  // Fan out in parallel — bounded by the dispatcher to <= 5. Promise.allSettled
  // (NOT Promise.all) so one provider's exception cannot 500 the whole tap:
  // each failing scout becomes a status="error" result with the message in
  // gaps, and the reducer keeps composing whatever did succeed.
  const settled = await Promise.allSettled(
    plan.scouts.map((job) => runScoutCached({ lng: lead.lng, lat: lead.lat, address: lead.address, job }))
  );
  const scoutResults: ScoutResult[] = settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    const job = plan.scouts[i]!;
    const message = s.reason instanceof Error ? s.reason.message : String(s.reason);
    log("warn", "scout.degraded", { leadId: lead.id, scout: job.type, error: message });
    return {
      scout: job.type,
      cards: [],
      gaps: [`scout failed: ${message}`],
      cost: { ms: 0, tokens: 0, calls: 0 },
      status: "error" as const,
    };
  });

  let reduced = reduce(scoutResults, Date.now() - started);
  if (reduced.summary.breakout?.kind === "deeper_scout") {
    const target = reduced.summary.breakout.target;
    const targetCard = reduced.summary.cards.find((card) => card.claim === target);
    const originalJob = plan.scouts.find((job) => job.type === targetCard?.scout);
    if (originalJob) {
      // Same degrade-gracefully envelope as the main fanout: the breakout
      // is best-effort and must never 500 the tap.
      let deeper: ScoutResult;
      try {
        deeper = await runScout({
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
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log("warn", "scout.degraded", { leadId: lead.id, scout: originalJob.type, error: message, breakout: true });
        deeper = {
          scout: originalJob.type,
          cards: [],
          gaps: [`breakout scout failed: ${message}`],
          cost: { ms: 0, tokens: 0, calls: 0 },
          status: "error",
        };
      }
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

  // Reuse the cross-lead hits we already pulled at the top of runSwarm — same
  // privacy guarantees (agent-scoped, neighborhood-kind only).
  const neighborhoodCount = siblingHits.length;
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

/** Basic RFC-5322-ish check: has one "@", no whitespace, at least one dot in
 *  the domain. Deliberately permissive — the connector's real send is the
 *  authority; this only rejects obviously-not-an-address strings so we don't
 *  build a Gmail draft whose `To:` is a friendly label. */
function isPlausibleEmail(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return false;
  return true;
}

/** Very loose phone check: at least 6 digits total. Same reasoning as above —
 *  the SMS provider is the authority for real deliverability. */
function isPlausiblePhone(value: string | undefined): boolean {
  if (!value) return false;
  return (value.match(/\d/g) ?? []).length >= 6;
}

function requiredChannelGap(
  actionType: ActionType,
  lead: LeadSurface,
): ComplianceResult | null {
  const flag = (category: string, issue: string, fix: string) => ({
    pass: false,
    flags: [
      {
        span: "recipient",
        category,
        issue,
        fix,
        severity: "block" as const,
      },
    ],
    checkedAt: nowISO(),
    linterVersion: "contactability-required-2.0.0",
  });

  if (actionType === "email" && !isPlausibleEmail(lead.contact?.email)) {
    return flag(
      "contact_channel_missing",
      "Cannot draft email: this lead has no known email address.",
      "Add a known email and its source on the lead card, then reopen the draft.",
    );
  }
  if (
    actionType === "email"
    && (lead.contact?.optOutEmail || lead.contact?.emailPermission === "opted_out")
  ) {
    return flag(
      "contact_channel_blocked",
      "Cannot draft email: this contact is opted out of email.",
      "Keep the opt-out. Use a different channel only if its permission is independently recorded.",
    );
  }
  if (actionType === "sms" && !isPlausiblePhone(lead.contact?.phone)) {
    return flag(
      "contact_channel_missing",
      "Cannot draft SMS: this lead has no known phone number.",
      "Add a known phone and its source on the lead card, then verify SMS permission.",
    );
  }
  if (actionType === "sms" && lead.contact?.smsPermission !== "allowed") {
    const optedOut = lead.contact?.optOutSms || lead.contact?.smsPermission === "opted_out";
    return flag(
      optedOut ? "contact_channel_blocked" : "contact_permission_unverified",
      optedOut
        ? "Cannot draft SMS: this contact is opted out of text messages."
        : "Cannot draft SMS: a phone number is saved, but SMS permission is not verified.",
      optedOut
        ? "Keep the opt-out. Do not use this number for SMS."
        : "Record the first-party or CRM permission source before drafting SMS.",
    );
  }
  return null;
}

async function persistBlockedArtifact(args: {
  agent: Agent;
  lead: LeadSurface;
  actionType: ActionType;
  loopRunId?: string;
  situation: Situation;
  situationConfidence: number;
  trigger: string;
  compliance: ComplianceResult;
}): Promise<Artifact> {
  const repo = await getRepo();
  const artifactId = uuid();
  const traceId = uuid();
  const artifact: Artifact = {
    id: artifactId,
    agent_id: args.agent.id,
    lead_surface_id: args.lead.id,
    loop_run_id: args.loopRunId,
    type: args.actionType,
    status: "blocked",
    // Empty typed payload — the client renders the compliance flag as
    // "setup required" rather than showing a fake draft body.
    payload:
      args.actionType === "email"
        ? { from: `${args.agent.name} <${args.agent.email}>`, to: "", subject: "", body: "" }
        : args.actionType === "sms"
          ? { to: "", body: "" }
          : { body: "", tags: [] },
    evidence_used: [],
    compliance_result: args.compliance,
    model_trace: {
      model: "channel-required-gate",
      promptVersion: "contactability-required-2.0.0",
      mode: "mock",
    },
    trace_id: traceId,
    revision: 1,
    created_at: nowISO(),
    updated_at: nowISO(),
  };
  await repo.saveArtifact(artifact);
  const trace = buildTrace({
    agentId: args.agent.id,
    artifact,
    loopRunId: args.loopRunId,
    trigger: args.trigger,
    situation: args.situation,
    situationConfidence: args.situationConfidence,
    evidenceUsed: [],
    excluded: [],
    compliance: args.compliance,
    cost: { claudeCalls: 0, paidDataCalls: 0, ms: 0 },
  });
  trace.id = traceId;
  await repo.saveTrace(trace);
  await emit(
    args.agent.id,
    "artifact.blocked",
    {
      artifactId,
      type: args.actionType,
      situation: args.situation,
      reason: args.compliance.flags[0]?.category ?? "contactability_blocked",
    },
    "pipeline",
    args.lead.id,
  );
  return artifact;
}

export async function draftArtifact(input: DraftInput): Promise<Artifact> {
  const repo = await getRepo();
  const { agent, lead } = input;
  if (agent.id !== lead.agent_id) {
    throw new Error("Cannot draft across tenant boundaries.");
  }

  // Contactability gate: require a real channel, honor every opt-out, and
  // require explicit SMS permission. Fail closed BEFORE the composer runs so
  // no unsafe recipient reaches a connector payload.
  const channelGap = requiredChannelGap(input.actionType, lead);
  if (channelGap) {
    const blocked = await persistBlockedArtifact({
      agent,
      lead,
      actionType: input.actionType,
      loopRunId: input.loopRunId,
      situation: input.situation,
      situationConfidence: input.situationConfidence,
      trigger: input.trigger,
      compliance: channelGap,
    });
    return blocked;
  }

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
    recipientLabel: lead.contact?.name ?? `Known contact · ${lead.address}`,
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

  let connectorBinding: ReviewedConnectorBinding | undefined;
  if (input.actionType === "crm_note" || input.actionType === "task") {
    const target = await connectorForAction(input.actionType, { agentId: agent.id });
    if (target.provider === "followupboss" || target.provider === "gohighlevel") {
      const binding = lead.contact?.providerRefs?.[target.provider];
      if (binding) {
        connectorBinding = {
          ...binding,
          provider: target.provider,
          label: lead.contact?.name ?? "Known contact",
        };
      } else if (target.mode === "live") {
        compliance.pass = false;
        compliance.flags.push({
          span: "CRM target",
          category: "crm_binding_missing",
          issue: `Cannot draft this ${input.actionType === "task" ? "task" : "note"}: the contact is not bound to ${target.provider}.`,
          fix: "Test the CRM credential, sync contacts, and reopen this draft.",
          severity: "block",
        });
      }
    }
  }

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
    connector_binding: connectorBinding,
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

async function finalizeApprovedArtifact(args: {
  repo: Repository;
  artifact: Artifact;
  lead: LeadSurface;
  result: ConnectorResult;
  key: string;
  deduped: boolean;
}): Promise<ApproveResult> {
  const { repo, artifact, result, key, deduped } = args;
  const isEmailDraft = artifact.type === "email";
  const current = await repo.getArtifact(artifact.id);
  if (!current) throw new Error("Artifact disappeared while finalizing approval.");

  let updated = current;
  if (current.status !== "approved" && current.status !== "sent") {
    const approvedAt = nowISO();
    const finalized = await repo.updateArtifactAtRevision(artifact.id, artifact.revision, {
      status: isEmailDraft ? "approved" : "sent",
      approved_at: approvedAt,
      approved_revision: artifact.revision,
      updated_at: approvedAt,
      sent_at: isEmailDraft ? undefined : approvedAt,
      external_draft_ref: result.externalId
        ? { provider: result.provider, externalId: result.externalId, url: result.url, idempotencyKey: key }
        : undefined,
    }, ["approving", "drafted"]);
    if (!finalized) {
      throw new Error("Artifact changed while finalizing a successful connector write; reconciliation is required.");
    }
    updated = finalized;
  }

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
    { artifactId: artifact.id, provider: result.provider, deduped },
    "pipeline",
    artifact.lead_surface_id,
    `${key}:artifact-approved`,
  );
  await emit(
    artifact.agent_id,
    "connector.write",
    { provider: result.provider, idempotencyKey: key, ok: result.ok },
    "connector",
    artifact.lead_surface_id,
    `${key}:connector-write`,
  );

  const latestEdit = artifact.edit_history?.at(-1);
  const editedExcerpt = latestEdit?.field === "body" ? latestEdit.after.slice(0, 240) : undefined;
  const verdict = editedExcerpt ? "edited" : "approved";
  const outcomeMem = await persistOutcomeMemory(updated, verdict, editedExcerpt);
  await emit(
    artifact.agent_id,
    "outcome.recorded",
    {
      verdict,
      artifactId: artifact.id,
      persisted: outcomeMem !== null,
      ...(outcomeMem ? { memoryId: outcomeMem.id } : {}),
    },
    "memory",
    artifact.lead_surface_id,
    `${key}:outcome-recorded`,
  );

  if (artifact.lead_surface_id) {
    const latestLead = await repo.getLead(artifact.lead_surface_id);
    if (latestLead) {
      await repo.upsertLead({
        ...latestLead,
        status: nextStatus(latestLead.status),
        last_worked_at: nowISO(),
      });
    }
  }

  return {
    artifact: updated,
    connector: {
      provider: result.provider,
      externalId: result.externalId,
      url: result.url,
      deduped,
      mode: result.mode,
      ok: result.ok,
      error: result.error,
    },
  };
}

export async function approveArtifact(
  artifactId: string,
  expectedRevision: number,
  opts: { agentId: string; googleAccessToken?: string; googleCredentialError?: string },
): Promise<ApproveResult | null> {
  const repo = await getRepo();
  const artifact = await repo.getArtifact(artifactId);
  if (!artifact || artifact.agent_id !== opts.agentId) return null;
  const lead = artifact.lead_surface_id ? await repo.getLead(artifact.lead_surface_id) : null;
  if (!lead || lead.agent_id !== opts.agentId) return null;
  if (artifact.revision !== expectedRevision) {
    throw new Error(
      `Artifact changed since review (expected revision ${expectedRevision}, current ${artifact.revision}).`
    );
  }

  // Fail-closed: a blocked artifact can never be approved/sent.
  if (artifact.status === "blocked" || !artifact.compliance_result.pass) {
    throw new Error("Cannot approve: compliance linter blocked this artifact.");
  }

  if (
    opts?.googleCredentialError &&
    !opts.googleAccessToken &&
    (artifact.type === "email" || artifact.type === "calendar")
  ) {
    throw new Error(`Connector write failed: ${opts.googleCredentialError}`);
  }

  const connector = await connectorForAction(artifact.type, {
    ...opts,
    agentId: artifact.agent_id,
  });
  let providerContact;
  if (connector.provider === "followupboss" || connector.provider === "gohighlevel") {
    const reviewed = artifact.connector_binding;
    const current = lead.contact?.providerRefs?.[connector.provider];
    if (
      !reviewed
      || reviewed.provider !== connector.provider
      || !current
      || reviewed.contactId !== current.contactId
      || reviewed.workspaceId !== current.workspaceId
      || reviewed.credentialVersion !== current.credentialVersion
    ) {
      throw new Error("Connector write failed: CRM contact binding changed or is missing. Sync contacts and create a new draft for review.");
    }
    providerContact = current;
  }
  const key = idempotencyKey([
    artifact.id,
    String(artifact.revision),
    artifact.type,
    connector.provider,
    providerContact?.workspaceId ?? "no-workspace",
    providerContact?.contactId ?? "no-contact",
  ]);
  const meta = {
    idempotencyKey: key,
    agentId: artifact.agent_id,
    leadSurfaceId: artifact.lead_surface_id,
    providerContact,
  };

  const durablePrior = await repo.getConnectorWrite(key);
  if (durablePrior) {
    if (!durablePrior.result.ok) {
      throw new Error("Connector write failed: a prior attempt is unresolved. Inspect the provider before revising and retrying.");
    }
    return finalizeApprovedArtifact({
      repo,
      artifact,
      lead,
      result: {
        provider: durablePrior.provider,
        ...durablePrior.result,
        state: durablePrior.result.state === "pending" ? "succeeded" : durablePrior.result.state,
        idempotencyKey: key,
      },
      key,
      deduped: true,
    });
  }

  // `approving` with no ledger row is a safe pre-I/O crash window: provider
  // calls are reachable only after the atomic connector-write reservation.
  // A retry may therefore resume at the reservation step. If a row exists,
  // the durable-prior branch above handles success/pending/reconciliation.
  const resumeBeforeProvider = artifact.status === "approving";
  if (artifact.status !== "drafted" && !resumeBeforeProvider) {
    throw new Error(`Cannot approve an artifact in ${artifact.status} state.`);
  }
  if (!resumeBeforeProvider) {
    const approvalClaim = await repo.updateArtifactAtRevision(
      artifact.id,
      artifact.revision,
      { status: "approving", updated_at: nowISO() },
      ["drafted"],
    );
    if (!approvalClaim) {
      const latest = await repo.getArtifact(artifact.id);
      if (latest?.revision !== artifact.revision) {
        throw new Error("Artifact changed while approval was starting; reload before approving.");
      }
      throw new Error("Artifact approval is already in progress.");
    }
  }

  const pendingWrite = {
    id: uuid(),
    agent_id: artifact.agent_id,
    artifact_id: artifact.id,
    provider: connector.provider,
    idempotency_key: key,
    result: {
      ok: false,
      deduped: false,
      mode: connector.mode,
      state: "pending" as const,
      error: "provider write pending",
    },
    created_at: nowISO(),
  };
  const claimed = await repo.claimConnectorWrite(pendingWrite);
  if (!claimed) {
    const prior = await repo.getConnectorWrite(key);
    if (prior?.result.ok) {
      return finalizeApprovedArtifact({
        repo,
        artifact,
        lead,
        result: {
          provider: prior.provider,
          ...prior.result,
          state: prior.result.state === "pending" ? "succeeded" : prior.result.state,
          idempotencyKey: key,
        },
        key,
        deduped: true,
      });
    }
    throw new Error("Connector write failed: another attempt is in progress or requires reconciliation.");
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
  await repo.saveConnectorWrite({
      id: pendingWrite.id,
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
        state: result.state ?? (result.ok ? "succeeded" : "failed"),
      },
      created_at: pendingWrite.created_at,
    });

  if (!result.ok) {
    if (result.state !== "indeterminate") {
      await repo.updateArtifactAtRevision(
        artifact.id,
        artifact.revision,
        { status: "drafted", updated_at: nowISO() },
        ["approving"],
      );
    }
    throw new Error(
      `Connector write failed: ${result.error ?? `${result.provider} returned an unsuccessful result`}`,
    );
  }
  return finalizeApprovedArtifact({ repo, artifact, lead, result, key, deduped: result.deduped });
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
  opts?: { agentId?: string },
): Promise<RejectResult | null> {
  const repo = await getRepo();
  const artifact = await repo.getArtifact(artifactId);
  if (!artifact) return null;
  // Tenant scope: same "not found" for missing and cross-tenant.
  if (opts?.agentId && artifact.agent_id !== opts.agentId) return null;
  // Idempotent: rejecting an already-cancelled artifact is a no-op.
  if (artifact.status === "cancelled") return { artifact };
  if (artifact.status === "approving") {
    throw new Error("Artifact approval is in progress; reconcile it before rejecting.");
  }

  const updated = await repo.updateArtifactAtRevision(artifact.id, artifact.revision, {
    status: "cancelled",
  }, [artifact.status]);
  if (!updated) throw new Error("Artifact changed concurrently; reload before rejecting.");

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
  // Always emit — see approve path for the rationale.
  await emit(
    artifact.agent_id,
    "outcome.recorded",
    {
      verdict: "rejected",
      artifactId: artifact.id,
      persisted: outcomeMem !== null,
      reason: reason ?? null,
      ...(outcomeMem ? { memoryId: outcomeMem.id } : {}),
    },
    "memory",
    artifact.lead_surface_id,
  );

  return { artifact: updated!, memoryId: outcomeMem?.id };
}

function nextStatus(s: LeadStatus): LeadStatus {
  if (s === "new" || s === "researching") return "contacted";
  return s;
}
