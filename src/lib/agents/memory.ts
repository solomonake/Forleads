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
  OutcomeVerdict,
} from "@/lib/core/types";
import { getRepo } from "@/lib/db";
import { getEmbedder } from "./embedder";

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

/** Embed + persist one evidence card as a memory row. */
export async function persistEvidenceMemory(
  agentId: string,
  lead: LeadSurface,
  card: EvidenceCard,
): Promise<Memory> {
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
  return repo.saveMemory(mem);
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
export function summarizeOutcomes(memos: Memory[]): {
  approved: number;
  edited: number;
  rejected: number;
  lastRejectedAt?: string;
} {
  let approved = 0;
  let edited = 0;
  let rejected = 0;
  let lastRejectedAt: string | undefined;
  for (const m of memos) {
    if (m.kind !== "outcome") continue;
    if (m.text.startsWith("[approved]")) approved++;
    else if (m.text.startsWith("[edited]")) edited++;
    else if (m.text.startsWith("[rejected]")) {
      rejected++;
      if (!lastRejectedAt || m.created_at > lastRejectedAt) {
        lastRejectedAt = m.created_at;
      }
    }
  }
  return { approved, edited, rejected, lastRejectedAt };
}

/** Recall prior outcomes for this lead, optionally filtered by action type.
 * Used by the composer-trace to surface "you already approved 2 emails here". */
export async function recallOutcomes(
  lead: LeadSurface,
  actionType?: string,
): Promise<Memory[]> {
  const repo = await getRepo();
  const embedder = getEmbedder();
  // Query string is intentionally generic — recall is lead-scoped at the DB
  // layer, so we just want every outcome row. We embed a short label so the
  // similarity ordering keeps approved/edited near the top.
  const q = await embedder.embed(`outcome ${actionType ?? ""}`);
  const hits = await repo.recallMemories(lead.id, q, 32);
  let memos = hits.map((h) => h.memory).filter((m) => m.kind === "outcome");
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

/** Recall the top-K most relevant memories for `lead` against a query string. */
export async function recallForLead(
  lead: LeadSurface,
  queryText: string,
  k = 8,
): Promise<RecallSummary> {
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
