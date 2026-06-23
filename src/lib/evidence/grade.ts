// ============================================================================
// Grading helpers — deterministic merge / upgrade / overall-grade logic.
// The LLM is used only for genuine judgment; grading math is code
// (docs/Forleads_AgentLoops_v1.md §4, §7 "determinism where possible").
// ============================================================================

import type { Confidence, EvidenceCard } from "@/lib/core/types";

const ORDER: Confidence[] = ["A", "B", "C", "D"];
const rank = (c: Confidence) => ORDER.indexOf(c);

/** Better (more confident) of two grades. A is best. */
export function betterGrade(a: Confidence, b: Confidence): Confidence {
  return rank(a) <= rank(b) ? a : b;
}

/** Worse (less confident) of two grades — used for money/decision claims. */
export function worseGrade(a: Confidence, b: Confidence): Confidence {
  return rank(a) >= rank(b) ? a : b;
}

/** When two independent sources agree, upgrade one notch (max A). */
export function upgradeOnAgreement(c: Confidence): Confidence {
  const i = Math.max(0, rank(c) - 1);
  return ORDER[i] ?? c;
}

const MONEY_CLAIM = /resale|comp|estimate|value|price|worth/i;

/**
 * Overall lead grade. Money/decision-critical claims are weighted worst-case
 * so an optimistic estimate can't inflate the headline grade.
 */
export function overallGrade(cards: EvidenceCard[]): Confidence {
  if (cards.length === 0) return "D";
  const moneyCards = cards.filter((c) => MONEY_CLAIM.test(c.claim));
  const pool = moneyCards.length ? moneyCards : cards;
  // Median-ish: take the worst of the strong half so one A doesn't carry it.
  const sorted = [...pool].sort((a, b) => rank(a.confidence) - rank(b.confidence));
  const idx = Math.floor(sorted.length / 2);
  return sorted[idx]?.confidence ?? "D";
}

export function gradeLabel(c: Confidence): string {
  switch (c) {
    case "A":
      return "Verified";
    case "B":
      return "Modeled";
    case "C":
      return "Sparse";
    case "D":
      return "Unverified — here's why";
  }
}

/** A money claim that lands at C or D is a break-out candidate. */
export function isBreakoutCandidate(card: EvidenceCard): boolean {
  return (
    MONEY_CLAIM.test(card.claim) &&
    (card.confidence === "C" || card.confidence === "D")
  );
}
