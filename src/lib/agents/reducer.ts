// ============================================================================
// Reducer — merge, de-dup, grade, detect conflict, decide break-out
// (docs/Forleads_AgentLoops_v1.md §4). Deterministic where possible; the
// break-out is capped at ONE, never recursive. Validates every card against
// the EvidenceCard contract and drops violators.
// ============================================================================

import type {
  EvidenceCard,
  ReduceSummary,
  ScoutResult,
} from "@/lib/core/types";
import { partitionCards } from "@/lib/evidence/validate";
import {
  isBreakoutCandidate,
  overallGrade,
  upgradeOnAgreement,
} from "@/lib/evidence/grade";

export interface ReduceResult {
  summary: ReduceSummary;
  rejected: { card: EvidenceCard; errors: string[] }[];
}

export function reduce(results: ScoutResult[], elapsedMs: number): ReduceResult {
  const allCards = results.flatMap((r) => r.cards);

  // 1. Validate against the contract; drop violators (logged via `rejected`).
  const { valid, rejected } = partitionCards(allCards);

  // 2. De-dup by claim; on agreement from independent sources, upgrade.
  const byClaim = new Map<string, EvidenceCard>();
  for (const card of valid) {
    const key = `${card.scout}:${card.claim.toLowerCase()}`;
    const existing = byClaim.get(key);
    if (!existing) {
      byClaim.set(key, card);
      continue;
    }
    // Two cards for the same claim → agreement?
    if (
      existing.value !== null &&
      card.value !== null &&
      String(existing.value) === String(card.value)
    ) {
      byClaim.set(key, {
        ...existing,
        confidence: upgradeOnAgreement(existing.confidence),
        sources: dedupeSources([...existing.sources, ...card.sources]),
        reasoning: "Upgraded: independent sources agree.",
      });
    } else {
      // Conflict → keep the stronger-graded, flag in reasoning.
      const keep = rank(existing.confidence) <= rank(card.confidence) ? existing : card;
      byClaim.set(key, {
        ...keep,
        reasoning: `Sources conflict (${existing.value} vs ${card.value}); kept higher-confidence.`,
      });
    }
  }

  const merged = [...byClaim.values()];

  // 3. Overall lead grade (worst-case weighting for money claims).
  const grade = overallGrade(merged);

  // 4. Break-out decision — at most ONE.
  const gaps = results.flatMap((r) => r.gaps);
  let breakout: ReduceSummary["breakout"];
  const moneyGap = merged.find(isBreakoutCandidate);
  const conflict = merged.find((c) => c.reasoning?.startsWith("Sources conflict"));
  if (moneyGap) {
    breakout = {
      kind: "ask_human",
      target: moneyGap.claim,
      question:
        "Is this the right unit/size? It materially changes the comp. (One question — no recursion.)",
      reason: `Money-critical claim "${moneyGap.claim}" graded ${moneyGap.confidence}.`,
    };
  } else if (conflict) {
    breakout = {
      kind: "deeper_scout",
      target: conflict.claim,
      reason: `Conflicting sources on "${conflict.claim}"; one deeper pass may resolve.`,
    };
  }

  return {
    summary: {
      cards: merged,
      grade,
      gaps,
      breakout,
      scoutCount: results.length,
      elapsedMs,
    },
    rejected,
  };
}

function dedupeSources(sources: EvidenceCard["sources"]): EvidenceCard["sources"] {
  const seen = new Set<string>();
  const out: EvidenceCard["sources"] = [];
  for (const s of sources) {
    const k = s.name + (s.url ?? "");
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

const ORDER = ["A", "B", "C", "D"];
const rank = (c: string) => ORDER.indexOf(c);
