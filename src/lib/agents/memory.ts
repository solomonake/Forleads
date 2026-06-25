// ============================================================================
// Memory — the lead-scoped recall layer.
//
// Before the dispatcher spends scout budget, it asks "what do we already know
// about this lead?". This module is the seam between the embedder and the
// repository: it owns the policy for how prior evidence + notes are turned
// into memory rows on write, and how those rows are pulled back on read.
//
// Privacy floor: recall is ALWAYS scoped to a single lead_surface_id. The
// repository contract enforces it; the RLS policy in 0005_memories.sql
// enforces it again at the DB layer. No cross-lead recall, ever.
// ============================================================================

import { nowISO, uuid } from "@/lib/core/ids";
import type {
  Artifact,
  Confidence,
  EvidenceCard,
  LeadSurface,
  Memory,
  MemoryHit,
  Note,
  DomainEvent,
  PriorOutcomeSummary,
  OutcomeVerdict,
} from "@/lib/core/types";
import { getRepo } from "@/lib/db";
import { getEmbedder } from "./embedder";
import { log } from "@/lib/observability";

// Degrade-gracefully envelope (CLAUDE.md non-negotiable #6): if the memory
// table or RPC is unavailable (schema drift, transient Supabase outage),
// the loop must still complete. Recall returns empty, persist returns null,
// and the failure is loud in the structured log so prod observability sees it.
function logMemoryDegraded(
  op: string,
  err: unknown,
  fields: Record<string, unknown> = {},
): void {
  const msg = err instanceof Error ? err.message : String(err);
  log("warn", "memory.degraded", { op, error: msg, ...fields });
}

// "Sufficient prior grounding" = at least this many prior cards with A or B.
// When recall is sufficient, the dispatcher drops the property scout entirely
// (the cheapest grounded scout we'd otherwise run from scratch).
export const SUFFICIENT_PRIOR_GROUNDED = 2;

export interface RecallSummary {
  hits: MemoryHit[];
  refs: string[];                  // memory ids — surfaced to ReduceSummary trace
  priorGroundedCount: number;      // # of evidence-kind hits with confidence A or B
  sufficient: boolean;
}

function evidenceSurfaceForm(card: EvidenceCard): string {
  const v = card.value === null ? "—" : String(card.value);
  return `[${card.scout}/${card.confidence}] ${card.claim}: ${v}`;
}

/** Embed + persist one evidence card as a memory row. Best-effort: if the
 *  memory table or embedder is unavailable, log and return null so the swarm
 *  still completes without recall on subsequent taps. */
export async function persistEvidenceMemory(
  agentId: string,
  lead: LeadSurface,
  card: EvidenceCard,
): Promise<Memory | null> {
  try {
    const repo = await getRepo();
    const embedder = getEmbedder();
    const text = evidenceSurfaceForm(card);
    const embedding = await embedder.embed(text);
    const mem: Memory = {
      id: uuid(),
      agent_id: agentId,
      lead_surface_id: lead.id,
      kind: "evidence",
      text,
      ref: card.id,
      confidence: card.confidence,
      embedding,
      created_at: nowISO(),
    };
    return await repo.saveMemory(mem);
  } catch (err) {
    logMemoryDegraded("persistEvidence", err, { leadId: lead.id, cardId: card.id });
    return null;
  }
}

// Only scouts already keyed by an area cell may cross leads. Property and
// imagery facts are parcel-specific, while people facts must never cross leads.
const NEIGHBORHOOD_SAFE_SCOUTS: ReadonlySet<EvidenceCard["scout"]> = new Set([
  "market",
]);

function neighborhoodSurfaceForm(card: EvidenceCard): string {
  const v = String(card.value);
  return `[${card.scout}/${card.confidence}] ${card.claim}: ${v}`;
}

/** Persist only transferable, grounded area facts. Always best-effort. */
export async function persistNeighborhoodMemory(
  agentId: string,
  lead: LeadSurface,
  card: EvidenceCard,
): Promise<Memory | null> {
  if (!NEIGHBORHOOD_SAFE_SCOUTS.has(card.scout)) return null;
  if (card.confidence !== "A" && card.confidence !== "B") return null;
  if (card.value === null) return null;
  if (!lead.h3_index) return null;
  try {
    const repo = await getRepo();
    const embedder = getEmbedder();
    const text = neighborhoodSurfaceForm(card);
    const embedding = await embedder.embed(text);
    const mem: Memory = {
      id: uuid(),
      agent_id: agentId,
      lead_surface_id: lead.id,
      kind: "neighborhood",
      text,
      ref: card.id,
      confidence: card.confidence,
      h3_index: lead.h3_index,
      embedding,
      created_at: nowISO(),
    };
    return await repo.saveMemory(mem);
  } catch {
    return null;
  }
}

/** How many cross-lead area facts do we already know about this cell?
 *  Returns [] on any failure so the dispatcher still runs without priors. */
export async function recallNeighborhood(
  agentId: string,
  h3Index: string,
  k = 16,
): Promise<MemoryHit[]> {
  try {
    const repo = await getRepo();
    return await repo.recallNeighborhood(agentId, h3Index, k);
  } catch (err) {
    logMemoryDegraded("recallNeighborhood", err, { agentId, h3Index });
    return [];
  }
}

export function renderNeighborhoodNote(n: number): string | null {
  if (n <= 0) return null;
  return `${n} area fact${n === 1 ? "" : "s"} known near this location`;
}

/** Strip an artifact payload down to a short human-readable excerpt for the
 * outcome memory text. Different action types have different "important" fields;
 * the excerpt is what surfaces to the agent later as "you already sent X here". */
function outcomeExcerpt(artifact: Artifact): string {
  const p = artifact.payload as unknown as Record<string, unknown>;
  const pick = (k: string): string | undefined => {
    const v = p[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const subject = pick("subject") ?? pick("title");
  const body = pick("body") ?? pick("notes");
  const parts: string[] = [];
  if (subject) parts.push(subject);
  if (body) parts.push(body);
  const text = parts.join(" — ") || JSON.stringify(p).slice(0, 200);
  return text.length > 240 ? `${text.slice(0, 237)}…` : text;
}

/** Embed + persist the human's verdict on a drafted artifact so the composer
 *  can warn before drafting a duplicate next time. Always best-effort: an
 *  outcome write must NEVER block the approve / reject flow. */
export async function persistOutcomeMemory(
  artifact: Artifact,
  verdict: OutcomeVerdict,
  editedExcerpt?: string,
): Promise<Memory | null> {
  if (!artifact.lead_surface_id) return null;
  try {
    const repo = await getRepo();
    const embedder = getEmbedder();
    const detailLabel = verdict === "rejected" ? "reason" : "edited";
    const tail = editedExcerpt
      ? ` · ${detailLabel}="${editedExcerpt.slice(0, 100)}${editedExcerpt.length > 100 ? "…" : ""}"`
      : "";
    const text = `[${verdict}] ${artifact.type}: ${outcomeExcerpt(artifact)}${tail}`;
    const embedding = await embedder.embed(text);
    const mem: Memory = {
      id: uuid(),
      agent_id: artifact.agent_id,
      lead_surface_id: artifact.lead_surface_id,
      kind: "outcome",
      text,
      ref: artifact.id,
      embedding,
      created_at: nowISO(),
    };
    return await repo.saveMemory(mem);
  } catch {
    // The embedder or DB hiccup must not break the human-gate flow.
    return null;
  }
}

/** Bucket a list of outcome-kind memories into approved/edited/rejected counts
 *  + the timestamp of the most recent rejection. Used by the composer + trace. */
export function summarizeOutcomes(memos: Memory[]): PriorOutcomeSummary {
  let approved = 0;
  let edited = 0;
  let rejected = 0;
  let lastRejectedAt: string | undefined;
  let latestVerdict: OutcomeVerdict | undefined;
  let latestAt: string | undefined;
  for (const m of memos) {
    if (m.kind !== "outcome") continue;
    let verdict: OutcomeVerdict | undefined;
    if (m.text.startsWith("[approved]")) {
      approved++;
      verdict = "approved";
    } else if (m.text.startsWith("[edited]")) {
      edited++;
      verdict = "edited";
    } else if (m.text.startsWith("[rejected]")) {
      rejected++;
      verdict = "rejected";
      if (!lastRejectedAt || m.created_at > lastRejectedAt) {
        lastRejectedAt = m.created_at;
      }
    }
    if (verdict && (!latestAt || m.created_at > latestAt)) {
      latestAt = m.created_at;
      latestVerdict = verdict;
    }
  }
  if (!latestAt || !latestVerdict) {
    throw new Error("summarizeOutcomes requires at least one valid outcome memory");
  }
  return { approved, edited, rejected, latestVerdict, latestAt, lastRejectedAt };
}

/** Recall prior outcomes for this lead, optionally filtered by action type.
 * Used by the composer-trace to surface "you already approved 2 emails here". */
export async function recallOutcomes(
  lead: LeadSurface,
  actionType?: string,
): Promise<Memory[]> {
  const repo = await getRepo();
  let memos = await repo.listOutcomeMemories(lead.id);
  if (actionType) {
    memos = memos.filter((m) => m.text.startsWith("[") && m.text.includes(`] ${actionType}:`));
  }
  return memos;
}

/** Embed + persist a free-text note as a memory row. */
export async function persistNoteMemory(note: Note): Promise<Memory> {
  const repo = await getRepo();
  const embedder = getEmbedder();
  const embedding = await embedder.embed(note.body);
  const mem: Memory = {
    id: uuid(),
    agent_id: note.agent_id,
    lead_surface_id: note.lead_surface_id,
    kind: "note",
    text: note.body,
    ref: note.id,
    embedding,
    created_at: nowISO(),
  };
  return repo.saveMemory(mem);
}

export async function persistEventMemory(event: DomainEvent): Promise<Memory | null> {
  if (!event.lead_surface_id) return null;
  const repo = await getRepo();
  const text = `[event/${event.type}] ${JSON.stringify(event.payload)}`;
  const embedding = await getEmbedder().embed(text);
  return repo.saveMemory({
    id: uuid(),
    agent_id: event.agent_id,
    lead_surface_id: event.lead_surface_id,
    kind: "event",
    text,
    ref: event.id,
    embedding,
    created_at: event.created_at,
  });
}

/** Recall the top-K most relevant memories for `lead` against a query string. */
export async function recallForLead(
  lead: LeadSurface,
  queryText: string,
  k = 8,
): Promise<RecallSummary> {
  try {
    const repo = await getRepo();
    const embedder = getEmbedder();
    const query = await embedder.embed(queryText);
    const hits = await repo.recallMemories(lead.id, query, k);

    // Only count evidence-kind memories with A/B as "grounded" for the budget rule.
    // Recall similarity threshold is intentionally loose (>= 0.0) because the
    // privacy scope IS the lead — every hit is on-topic by construction.
    const groundedConfidences: Confidence[] = ["A", "B"];
    const priorGroundedCount = hits.filter(
      (h) =>
        h.memory.kind === "evidence" &&
        h.memory.confidence !== undefined &&
        groundedConfidences.includes(h.memory.confidence),
    ).length;

    return {
      hits,
      refs: hits.map((h) => h.memory.id),
      priorGroundedCount,
      sufficient: priorGroundedCount >= SUFFICIENT_PRIOR_GROUNDED,
    };
  } catch (err) {
    logMemoryDegraded("recallForLead", err, { leadId: lead.id });
    return { hits: [], refs: [], priorGroundedCount: 0, sufficient: false };
  }
}

/**
 * Render a FOMO-flavored single-line summary that's only honest when the
 * dispatcher actually consulted recall. Returns null when nothing was recalled
 * so callers can omit the field rather than emit empty noise.
 */
export function renderRecallNote(r: RecallSummary): string | null {
  if (r.hits.length === 0) return null;
  if (r.sufficient) {
    return `Found ${r.priorGroundedCount} fact${r.priorGroundedCount === 1 ? "" : "s"} you'd previously grounded · skipping fresh property research`;
  }
  return `Recalled ${r.hits.length} prior signal${r.hits.length === 1 ? "" : "s"} for this lead — no shortcut taken`;
}
