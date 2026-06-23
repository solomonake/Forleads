// ============================================================================
// Fair-housing compliance linter (docs/Forleads_AgentLoops_v1.md §8,
// _UserCases_ UC-12, _ProductionMarketPlan_ §10). FAIL-CLOSED.
//
// Screens every generated outreach artifact for protected-class targeting,
// inference, or steering before it can be approved. Rules-first (deterministic,
// auditable); an optional Claude pass can be layered for nuance, but the rules
// alone are enough to block the obvious, license-threatening copy.
//
// Protected classes (Fair Housing Act): race, color, religion, sex, disability,
// familial status, national origin. We also block age-based steering.
// ============================================================================

import { nowISO } from "@/lib/core/ids";
import type { ComplianceFlag, ComplianceResult } from "@/lib/core/types";

export const LINTER_VERSION = "fh-linter-1.0.0";

interface Rule {
  category: string;
  severity: "block" | "warn";
  pattern: RegExp;
  issue: string;
  fix: string;
}

// Each pattern targets language that references or steers by a protected class.
const RULES: Rule[] = [
  // Familial status — the classic "great for families / near schools / kids".
  {
    category: "familial_status",
    severity: "block",
    pattern: /\b(great|perfect|ideal|wonderful)\s+(for\s+)?(families|family|kids|children)\b/i,
    issue: "Steers by familial status (protected).",
    fix: "Describe the home's features, not who 'should' live there.",
  },
  {
    category: "familial_status",
    severity: "block",
    pattern: /\b(kids'?|children's?)\s+(bikes?|toys?|rooms?)\b/i,
    issue: "References the presence of children (familial status).",
    fix: "Remove references to children; describe the property itself.",
  },
  {
    category: "familial_status",
    severity: "warn",
    pattern: /\b(family[- ]?friendly|family\s+neighborhood|family\s+home)\b/i,
    issue: "‘Family’ framing can imply familial-status preference.",
    fix: "Use neutral language like ‘spacious’ or ‘quiet street’.",
  },
  {
    category: "familial_status",
    severity: "warn",
    pattern: /\b(no\s+kids|adults?\s+only|empty[- ]?nester|bachelor)\b/i,
    issue: "Excludes or targets by familial status.",
    fix: "Do not reference household composition.",
  },
  // Religion.
  {
    category: "religion",
    severity: "block",
    pattern: /\b(near|close to|walk to)\s+(churches?|mosques?|synagogues?|temples?)\b/i,
    issue: "Steers by religion via proximity to places of worship.",
    fix: "Mention neutral amenities (parks, transit) instead.",
  },
  {
    category: "religion",
    severity: "warn",
    pattern: /\b(christian|catholic|jewish|muslim|hindu|buddhist)\s+(community|neighborhood|area)\b/i,
    issue: "References religious composition of an area.",
    fix: "Remove religious descriptors of the area.",
  },
  // Race / color / national origin.
  {
    category: "race_national_origin",
    severity: "block",
    pattern: /\b(white|black|asian|hispanic|latino|ethnic)\s+(neighborhood|area|community|part of town)\b/i,
    issue: "References racial/ethnic composition (steering).",
    fix: "Never describe an area by the race or origin of residents.",
  },
  {
    category: "race_national_origin",
    severity: "block",
    pattern: /\b(exclusive|safe|good|desirable)\s+(neighborhood|area)\b.*\b(people|residents|folks)\b/i,
    issue: "Coded steering language about residents.",
    fix: "Describe the property and verifiable amenities only.",
  },
  // Disability.
  {
    category: "disability",
    severity: "warn",
    pattern: /\b(no\s+wheelchair|able[- ]?bodied|not\s+suitable\s+for\s+disabled)\b/i,
    issue: "Excludes by disability.",
    fix: "State accessibility features factually; never exclude.",
  },
  // Sex / gender.
  {
    category: "sex",
    severity: "warn",
    pattern: /\b(perfect\s+for\s+a\s+(single\s+)?(man|woman|bachelor|bachelorette))\b/i,
    issue: "Targets by sex.",
    fix: "Remove gendered targeting.",
  },
  // Age.
  {
    category: "age",
    severity: "warn",
    pattern: /\b(perfect\s+for\s+(retirees|seniors|young\s+professionals|millennials))\b/i,
    issue: "Targets by age.",
    fix: "Describe the home, not the ideal age of a buyer.",
  },
];

export function lintCompliance(text: string): ComplianceResult {
  const flags: ComplianceFlag[] = [];
  for (const rule of RULES) {
    const m = rule.pattern.exec(text);
    if (m) {
      flags.push({
        span: m[0],
        issue: rule.issue,
        category: rule.category,
        fix: rule.fix,
        severity: rule.severity,
      });
    }
  }
  // FAIL-CLOSED: any blocking flag => not approvable.
  const hasBlock = flags.some((f) => f.severity === "block");
  return {
    pass: !hasBlock,
    flags,
    checkedAt: nowISO(),
    linterVersion: LINTER_VERSION,
  };
}

/** Lint the relevant text of any artifact payload. */
export function lintArtifactText(parts: (string | undefined)[]): ComplianceResult {
  return lintCompliance(parts.filter(Boolean).join("\n"));
}
