// ============================================================================
// EvidenceCard contract enforcement (docs/Forleads_AgentLoops_v1.md §2).
//
//   HARD RULE: if confidence !== 'D' then sources.length >= 1 && value != null
//   if confidence === 'D' then value must be null and a gap/reasoning given.
//
// This is the "no fabrication" guarantee, enforced in code. The Reducer drops
// any card that violates it and logs the violation.
// ============================================================================

import type { Confidence, EvidenceCard } from "@/lib/core/types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const SCOUTS = new Set(["property", "imagery", "people", "market", "risk"]);
const GRADES = new Set<Confidence>(["A", "B", "C", "D"]);

export function validateEvidenceCard(card: EvidenceCard): ValidationResult {
  const errors: string[] = [];

  if (!card.claim || card.claim.trim() === "") {
    errors.push("claim must be a non-empty string");
  }
  if (!SCOUTS.has(card.scout)) {
    errors.push(`unknown scout: ${String(card.scout)}`);
  }
  if (!GRADES.has(card.confidence)) {
    errors.push(`invalid confidence: ${String(card.confidence)}`);
  }
  if (!Array.isArray(card.sources)) {
    errors.push("sources must be an array");
  }

  const grade = card.confidence;
  if (grade && grade !== "D") {
    // Non-D cards MUST be grounded.
    if (!Array.isArray(card.sources) || card.sources.length < 1) {
      errors.push(
        `confidence ${grade} requires >= 1 source (no naked numbers)`
      );
    }
    if (card.value === null || card.value === undefined) {
      errors.push(`confidence ${grade} requires a non-null value`);
    }
  } else if (grade === "D") {
    // D cards MUST be honest gaps.
    if (card.value !== null && card.value !== undefined) {
      errors.push("confidence D requires value to be null (honest gap)");
    }
    if (
      (!card.reasoning || card.reasoning.trim() === "") &&
      (!card.sources || card.sources.length === 0)
    ) {
      // A D card with no source must at least explain the gap.
      if (!card.reasoning) {
        errors.push("confidence D requires reasoning explaining the gap");
      }
    }
  }

  // Sources, when present, must name something.
  for (const s of card.sources ?? []) {
    if (!s || !s.name || s.name.trim() === "") {
      errors.push("every source must have a name");
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

export function isValidEvidenceCard(card: EvidenceCard): boolean {
  return validateEvidenceCard(card).valid;
}

/** Partition a batch of cards into valid / rejected (for the Reducer). */
export function partitionCards(cards: EvidenceCard[]): {
  valid: EvidenceCard[];
  rejected: { card: EvidenceCard; errors: string[] }[];
} {
  const valid: EvidenceCard[] = [];
  const rejected: { card: EvidenceCard; errors: string[] }[] = [];
  for (const card of cards) {
    const res = validateEvidenceCard(card);
    if (res.valid) valid.push(card);
    else rejected.push({ card, errors: res.errors });
  }
  return { valid, rejected };
}
