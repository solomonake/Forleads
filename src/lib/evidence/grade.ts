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
 * Overall lead grade — reflects what was actually grounded. A pure "no data
 * source" D-gap (e.g. no market provider) is shown honestly per-card but does
 * NOT define the headline; otherwise every thin-region lead would read D even
 * with grade-A property facts. Money/decision-critical claims that DO carry
 * data (C or better) are still weighted worst-case so an optimistic estimate
 * can't inflate the headline.
 */
export function overallGrade(cards: EvidenceCard[]): Confidence {
  const grounded = cards.filter((c) => c.confidence !== "D");
  if (grounded.length === 0) return "D"; // nothing grounded → honestly D

  // If a money claim is grounded but weak (C), let it pull the headline down.
  const weakMoney = grounded.filter((c) => MONEY_CLAIM.test(c.claim) && c.confidence === "C");
  const sorted = [...grounded].sort((a, b) => rank(a.confidence) - rank(b.confidence));
  const idx = Math.floor(sorted.length / 2); // median of grounded cards
  const median = sorted[idx]?.confidence ?? "D";
  // Worst-case nudge: if a grounded money claim is C, cap the headline at C.
  return weakMoney.length ? worseGrade(median, "C") : median;
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
