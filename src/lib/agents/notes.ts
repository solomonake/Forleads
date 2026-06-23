// ============================================================================
// Notes classifier — note → situation → next-best-action
// (docs/Forleads_AgentLoops_v1.md §6, _UserCases_ UC-1/2/10).
//
// Deterministic keyword classifier (works offline, in mock mode). In live mode
// a Claude few-shot pass can refine; the contract/output shape is identical.
// ============================================================================

import type {
  ActionType,
  NoteClassification,
  Situation,
  SuggestedAction,
} from "@/lib/core/types";
import { claudeLive } from "@/lib/core/config";
import { claudeJSON } from "./claude";

interface Matcher {
  situation: Situation;
  patterns: RegExp[];
  confidence: number;
}

const MATCHERS: Matcher[] = [
  {
    situation: "no_contact",
    confidence: 0.91,
    patterns: [/no answer/i, /\bknock/i, /nobody/i, /no one/i, /not home/i, /left a card/i],
  },
  {
    situation: "interested_seller",
    confidence: 0.86,
    patterns: [/too big/i, /downsiz/i, /thinking of selling/i, /interested in selling/i, /kids moved out/i, /empty/i],
  },
  {
    situation: "objection:timing",
    confidence: 0.84,
    patterns: [/wrong time/i, /\btiming\b/i, /not the right time/i, /maybe later/i, /wait(ing)? (a )?(bit|while)/i],
  },
  {
    situation: "objection:price",
    confidence: 0.82,
    patterns: [/too low/i, /worth more/i, /price is/i, /not enough money/i, /lowball/i],
  },
  {
    situation: "objection:agent_loyalty",
    confidence: 0.8,
    patterns: [/already (have|working with) an agent/i, /my (friend|cousin|nephew) is an agent/i, /loyal to/i],
  },
  {
    situation: "buyer_criteria",
    confidence: 0.85,
    patterns: [/buyer wants/i, /looking for a \d+[- ]?bed/i, /\bunder \$?\d/i, /needs a (garden|yard|garage)/i],
  },
  {
    situation: "needs_repair_info",
    confidence: 0.78,
    patterns: [/needs (work|repairs?)/i, /roof looks/i, /fixer/i, /renovat/i, /condition/i],
  },
  {
    situation: "dead_not_now",
    confidence: 0.83,
    patterns: [/not interested/i, /do not contact/i, /lose my number/i, /\bnever\b/i, /remove me/i],
  },
];

const ACTIONS: Record<Situation, SuggestedAction[]> = {
  no_contact: [
    { type: "email", label: "Warm follow-up letter", recommended: true, rationale: "Re-engage after a no-answer with a low-pressure, grounded note." },
    { type: "task", label: "Retry-knock task in 4 days", recommended: false, rationale: "Keep the door warm without dropping the lead." },
    { type: "task", label: "Add to 6-month nurture", recommended: false, rationale: "Long-cycle touch so the lead is never forgotten." },
  ],
  interested_seller: [
    { type: "email", label: "Empathetic 'your options' letter", recommended: true, rationale: "Speak to options, not pressure; cite only grounded comps." },
    { type: "task", label: "Prep a comparative market packet", recommended: false, rationale: "CMA prep for an interested seller." },
    { type: "calendar", label: "Request an appointment + calendar hold", recommended: false, rationale: "Move toward a listing conversation." },
  ],
  "objection:timing": [
    { type: "email", label: "Tailored timing-objection reply", recommended: true, rationale: "Address timing with facts about their street, no pressure." },
    { type: "email", label: "Share a market-timing one-pager", recommended: false, rationale: "Educational, evidence-backed." },
    { type: "task", label: "Enrol in no-drop follow-up cadence", recommended: false, rationale: "Never let a timing objection go cold." },
  ],
  "objection:price": [
    { type: "email", label: "Price-objection reply with cited comps", recommended: true, rationale: "Re-anchor on grounded evidence, never a naked number." },
    { type: "task", label: "Schedule a value walkthrough", recommended: false, rationale: "Show the basis for pricing in person." },
  ],
  "objection:agent_loyalty": [
    { type: "email", label: "Respectful 'keep me in mind' note", recommended: true, rationale: "Stay top-of-mind without poaching." },
    { type: "task", label: "Long-cycle nurture", recommended: false, rationale: "Loyalty can change; stay present." },
  ],
  buyer_criteria: [
    { type: "task", label: "Create a buyer Watcher", recommended: true, rationale: "Stand up a watcher for the stated criteria." },
    { type: "email", label: "Confirmation message to the buyer", recommended: false, rationale: "Confirm criteria and set expectations." },
  ],
  needs_repair_info: [
    { type: "email", label: "Request-for-info draft", recommended: true, rationale: "Gather repair details before valuing." },
    { type: "crm_note", label: "Note contractor-referral need", recommended: false, rationale: "Track the follow-up." },
  ],
  dead_not_now: [
    { type: "email", label: "Polite close + long-cycle nurture", recommended: true, rationale: "Respect the no; keep a respectful long touch." },
    { type: "crm_note", label: "Mark opted-out / do-not-contact", recommended: false, rationale: "Honor opt-out." },
  ],
  unknown: [
    { type: "task", label: "Create a follow-up task", recommended: true, rationale: "Couldn't classify — keep the lead from going cold." },
  ],
};

export function classifyNote(body: string): NoteClassification {
  let best: { situation: Situation; confidence: number } = {
    situation: "unknown",
    confidence: 0.4,
  };
  for (const m of MATCHERS) {
    if (m.patterns.some((p) => p.test(body))) {
      if (m.confidence > best.confidence) {
        best = { situation: m.situation, confidence: m.confidence };
      }
    }
  }
  return {
    situation: best.situation,
    confidence: best.confidence,
    suggested_actions: ACTIONS[best.situation],
    reasoning:
      best.situation === "unknown"
        ? "No strong situation signal found in the note; defaulting to a follow-up task so the lead isn't dropped."
        : `Matched situation '${best.situation}' from note keywords.`,
  };
}

export function defaultActionType(situation: Situation): ActionType {
  return ACTIONS[situation].find((a) => a.recommended)?.type ?? "task";
}

// ---- Live (Claude) path -----------------------------------------------------
// Same contract/output shape as classifyNote; Claude just reads the situation
// with more nuance than keywords. The suggested actions stay deterministic
// (mapped from the situation) so the next-best-action set never drifts.

const VALID_SITUATIONS: readonly Situation[] = [
  "no_contact",
  "interested_seller",
  "objection:timing",
  "objection:price",
  "objection:agent_loyalty",
  "buyer_criteria",
  "needs_repair_info",
  "dead_not_now",
  "unknown",
];

async function classifyNoteLive(body: string): Promise<NoteClassification> {
  const system = [
    `You classify a real-estate agent's field note into exactly ONE situation.`,
    `Allowed situations: ${VALID_SITUATIONS.join(", ")}.`,
    `Choose the single best match. Use "unknown" only when none fit. "confidence" is 0..1.`,
  ].join("\n");
  const out = await claudeJSON<{ situation?: string; confidence?: number; reasoning?: string }>({
    system,
    user: `NOTE: ${body}`,
    schemaHint: `{ "situation": string, "confidence": number, "reasoning": string }`,
    maxTokens: 200,
  });
  const situation = VALID_SITUATIONS.find((s) => s === out.situation);
  if (!situation) throw new Error(`live classifier returned invalid situation: ${out.situation}`);
  const confidence =
    typeof out.confidence === "number" && out.confidence >= 0 && out.confidence <= 1
      ? out.confidence
      : 0.7;
  return {
    situation,
    confidence,
    suggested_actions: ACTIONS[situation],
    reasoning: out.reasoning?.trim() || `Claude classified the note as '${situation}'.`,
  };
}

/**
 * Entry point for the notes route: live Claude when enabled, deterministic
 * keyword classifier otherwise. Any live failure falls back totally.
 */
export async function classifyNoteBest(body: string): Promise<NoteClassification> {
  if (claudeLive()) {
    // .catch attaches synchronously — any live failure falls back totally.
    return classifyNoteLive(body).catch(() => classifyNote(body));
  }
  return classifyNote(body);
}
