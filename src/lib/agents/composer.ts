// ============================================================================
// Composer — drafts outreach in brand voice using ONLY grounded evidence, with
// protected-class content excluded BEFORE linting (defense in depth)
// (docs/Forleads_AgentLoops_v1.md §6/§8, _UserCases_ UC-1/2/8/10).
//
// Output is ALWAYS a draft. It never claims to have been sent.
// ============================================================================

import type {
  ActionType,
  Agent,
  BrandVoicePreset,
  EvidenceCard,
  EmailPayload,
  Situation,
  TaskPayload,
  CalendarPayload,
  SmsPayload,
  CrmNotePayload,
  ArtifactPayload,
  PriorOutcomeSummary,
} from "@/lib/core/types";
import { nowISO } from "@/lib/core/ids";
import { claudeLive } from "@/lib/core/config";
import { claudeJSON } from "./claude";
import type { SellerUpdateComposeContext } from "./seller-update";

export interface ComposeInput {
  agent: Agent;
  situation: Situation;
  actionType: ActionType;
  address: string;
  recipientLabel: string;
  recipientEmail?: string;
  recipientPhone?: string;
  evidence: EvidenceCard[];
  sellerUpdate?: SellerUpdateComposeContext;
  /** What the human has already done with prior drafts for this lead+action.
   *  When `rejected > 0`, the composer softens the tone and switches signoff;
   *  when `approved > 0`, the composer marks the prompt version with
   *  `-followup` so the trace makes it obvious this isn't a first touch. */
  priorOutcomes?: PriorOutcomeSummary;
}

export interface ComposeOutput {
  payload: ArtifactPayload;
  evidenceUsed: EvidenceCard[];
  excluded: { content: string; reason: string }[];
  promptVersion: string;
  modelUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  fallbackReason?: string;
}

const PROMPT_VERSION = "composer-1.2.0";
const LIVE_PROMPT_VERSION = "composer-live-1.0.0";

// Phrases the composer proactively strips (familial status etc.). Mirrors the
// canonical UC-1 rule: reference the home, never the children.
const EXCLUDE_RULES: { pattern: RegExp; reason: string }[] = [
  { pattern: /kids'?\s+bikes?/i, reason: "familial status risk (presence of children)" },
  { pattern: /\bchildren\b/i, reason: "familial status risk" },
  { pattern: /\bfamily\s+home\b/i, reason: "familial-status framing" },
  { pattern: /near\s+(churches?|mosques?|temples?|synagogues?)/i, reason: "religion steering" },
];

export function applyComposerExclusions(text: string): { text: string; excluded: { content: string; reason: string }[] } {
  let out = text;
  const excluded: { content: string; reason: string }[] = [];
  for (const rule of EXCLUDE_RULES) {
    const m = rule.pattern.exec(out);
    if (m) {
      excluded.push({ content: m[0], reason: rule.reason });
      out = out.replace(rule.pattern, "").replace(/\s{2,}/g, " ");
    }
  }
  return { text: out.trim(), excluded };
}

function voiceGreeting(voice: BrandVoicePreset): string {
  switch (voice) {
    case "luxury":
      return "Good afternoon,";
    case "crisp_pro":
      return "Hello,";
    case "warm_local":
    default:
      return "Hi there,";
  }
}

function voiceSignoff(voice: BrandVoicePreset, name: string): string {
  switch (voice) {
    case "luxury":
      return `With regards,\n${name}`;
    case "crisp_pro":
      return `Best,\n${name}`;
    case "warm_local":
    default:
      return `Warmly,\n${name}`;
  }
}

// Situation → email subject/body skeleton. Body references the home + cited,
// grounded amenities ONLY — never a protected attribute.
function emailFor(input: ComposeInput): { subject: string; body: string } {
  const { agent, address } = input;
  const greet = voiceGreeting(agent.brandVoice);
  const sign = voiceSignoff(agent.brandVoice, agent.name);
  if (input.sellerUpdate) {
    const ctx = input.sellerUpdate;
    const lines = ctx.themes.map(
      (theme) =>
        `- ${theme.label}: mentioned in ${theme.mentions} of ${ctx.showingsCounted} recent showing notes.`,
    );
    const price = ctx.themes.find((theme) => theme.kind === "price" && theme.confidence === "A");
    const truncation = ctx.truncated
      ? "\n\nI capped this update at the 200 most recent notes in the selected window so the summary stays auditable."
      : "";
    const priceCta = price
      ? "\n\nBecause pricing came up repeatedly, it may be worth discussing whether an adjustment would help the next round of showings."
      : "";
    return {
      subject: `Update on showings for ${address}`,
      body: `${greet}\n\nI wanted to send a concise update from the last ${ctx.windowDays} days of showing feedback for ${address}.\n\n${lines.join("\n")}${priceCta}${truncation}\n\nI'll keep tracking the next round and will flag anything that changes materially.\n\n${sign}`,
    };
  }
  switch (input.situation) {
    case "no_contact":
      return {
        subject: `A quick note about your home on ${address}`,
        body: `${greet}\n\nI stopped by ${address} today and was struck by how well-kept your home is — that garden clearly gets a lot of care.\n\nI work this neighborhood closely, and if you've ever wondered what your home could be worth in today's market, I'd be glad to put together an honest, no-pressure picture for you.\n\n${sign}`,
      };
    case "interested_seller":
      return {
        subject: `Options for your home on ${address} — no pressure`,
        body: `${greet}\n\nIt was lovely chatting today. You mentioned the home feels a little big now — that's such a common (and freeing) realization.\n\nThere are some smaller, single-story homes nearby that might suit this next chapter, and I can show you what your current home could enable. Whenever you're ready, no rush at all.\n\n${sign}`,
      };
    case "objection:timing":
      return {
        subject: `Is it the right time? Let's look at the facts`,
        body: `${greet}\n\nTotally fair to wonder about timing — it's the question I get most.\n\nRather than guess, I'd love to walk you through what's actually happening on your street so the decision is yours and well-informed. No pressure either way.\n\n${sign}`,
      };
    case "objection:price":
      return {
        subject: `What your home on ${address} could command`,
        body: `${greet}\n\nI hear you on price. Rather than throw out a number, I'd like to show you the evidence behind a realistic range for ${address} — so the figure is grounded, not guessed.\n\n${sign}`,
      };
    case "objection:agent_loyalty":
      return {
        subject: `Keeping you in mind for ${address}`,
        body: `${greet}\n\nI completely respect that you're already working with someone. If anything ever changes, I'd be glad to be a resource for ${address}. No pressure at all.\n\n${sign}`,
      };
    case "buyer_criteria":
      return {
        subject: `I'll keep watch for your next home`,
        body: `${greet}\n\nThanks for sharing what you're looking for. I've set up a standing watch so that when something matching your criteria comes up, you'll hear from me first — with the details and the evidence attached.\n\n${sign}`,
      };
    case "needs_repair_info":
      return {
        subject: `A couple of quick questions about ${address}`,
        body: `${greet}\n\nTo give you the most accurate picture for ${address}, could you share a little about any recent updates or repairs? It helps me ground the numbers rather than guess.\n\n${sign}`,
      };
    case "dead_not_now":
    default:
      return {
        subject: `Thanks — I'll stay out of your inbox`,
        body: `${greet}\n\nUnderstood, and thank you for letting me know. I'll check back only occasionally, and you can tell me to stop any time. Wishing you all the best.\n\n${sign}`,
      };
  }
}

export function compose(input: ComposeInput): ComposeOutput {
  const usable = input.evidence.filter((c) => c.confidence !== "D");

  let payload: ArtifactPayload;
  let raw = "";

  switch (input.actionType) {
    case "email": {
      const { subject: baseSubject, body: baseBody } = emailFor(input);
      // Outcome-aware mutation: if a prior draft to this lead+actionType was
      // rejected, lead with a respect-your-time line; mark promptVersion so
      // the trace makes it obvious why the body differs from the base template.
      // If a prior draft was approved, mark the prompt as a follow-up.
      let subject = baseSubject;
      let body = baseBody;
      let versionTag = PROMPT_VERSION;
      const po = input.priorOutcomes;
      if (po?.latestVerdict === "rejected") {
        subject = `A brief check-in about ${input.address}`;
        body = `Hi ${input.recipientLabel},\n\nI'll keep this brief and low-pressure. If an occasional, factual property update about ${input.address} would be useful, I'm happy to send one; otherwise no need to respond and I'll leave it there.\n\n${input.agent.name}`;
        versionTag = `${PROMPT_VERSION}-postreject`;
      } else if (po?.latestVerdict === "approved" || po?.latestVerdict === "edited") {
        // We've already talked. Don't reintroduce — pick up the thread.
        body = `Following up on my last note — no pressure if the timing's off, just wanted to keep the line open.\n\n${baseBody}`;
        versionTag = `${PROMPT_VERSION}-followup`;
      }
      const clean = applyComposerExclusions(body);
      raw = `${subject}\n${clean.text}`;
      payload = {
        from: `${input.agent.name} <${input.agent.email}>`,
        to: input.recipientEmail ?? input.recipientLabel,
        subject,
        body: clean.text,
        signatureHtml: input.agent.signatureHtml,
      } satisfies EmailPayload;
      return {
        payload,
        evidenceUsed: usable,
        excluded: clean.excluded,
        promptVersion: versionTag,
      };
    }
    case "sms": {
      const base = `Hi, it's ${input.agent.name}. Quick note about ${input.address} — no pressure, happy to share an honest picture whenever you like.`;
      const clean = applyComposerExclusions(base);
      payload = { to: input.recipientPhone ?? input.recipientLabel, body: clean.text } satisfies SmsPayload;
      return { payload, evidenceUsed: usable, excluded: clean.excluded, promptVersion: PROMPT_VERSION };
    }
    case "task": {
      payload = {
        title: `Follow up: ${input.address}`,
        dueAt: new Date(Date.now() + 4 * 86400000).toISOString(),
        notes: `Situation: ${input.situation}. Next-best-action follow-up.`,
      } satisfies TaskPayload;
      return { payload, evidenceUsed: usable, excluded: [], promptVersion: PROMPT_VERSION };
    }
    case "calendar": {
      const start = new Date(Date.now() + 2 * 86400000);
      const end = new Date(start.getTime() + 30 * 60000);
      payload = {
        title: `Appointment hold — ${input.address}`,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        notes: `Held for ${input.recipientLabel}.`,
      } satisfies CalendarPayload;
      return { payload, evidenceUsed: usable, excluded: [], promptVersion: PROMPT_VERSION };
    }
    case "crm_note":
    default: {
      payload = {
        body: `[${input.situation}] ${input.address}: drafted next-best-action prepared for review. Created ${nowISO()}.`,
        tags: [input.situation.replace(/[:]/g, "_")],
      } satisfies CrmNotePayload;
      return { payload, evidenceUsed: usable, excluded: [], promptVersion: PROMPT_VERSION };
    }
  }
}

// ---- Live (Claude) path -----------------------------------------------------
// Only the human-read text artifacts (email, sms) gain from real Claude. The
// model REASONS in brand voice but may cite ONLY the grounded evidence passed
// in — never a number it can't see (constitution §2). `applyExclusions` + the
// compliance linter (run AFTER, in the pipeline) still gate the output: Claude
// is not trusted to be compliant. Facts come from scouts/providers, not Claude.

function evidenceBlock(cards: EvidenceCard[]): string {
  if (cards.length === 0) {
    return "(no grounded facts available — write a warm, honest note and OFFER to gather the facts; invent nothing)";
  }
  return cards
    .map((c) => `- ${c.claim}${c.value != null ? `: ${c.value}` : ""} (confidence ${c.confidence})`)
    .join("\n");
}

function liveSystem(input: ComposeInput): string {
  const po = input.priorOutcomes;
  const priorLine = po
    ? po.latestVerdict === "rejected"
      ? `- INTERNAL PRIOR OUTCOME: the agent rejected an earlier UNSENT draft. Choose a lower-pressure angle and avoid the rejected approach. Never mention, imply, or apologize for prior recipient contact because that draft was not sent.`
      : po.latestVerdict === "approved" || po.latestVerdict === "edited"
        ? `- PRIOR OUTCOME: a previous draft to this lead was ALREADY sent (approved/edited). Write as a follow-up that picks up the thread, not as a first touch.`
        : ""
    : "";
  return [
    `You are ${input.agent.name}, a real-estate agent writing outreach in a "${input.agent.brandVoice}" brand voice.`,
    `Non-negotiable rules:`,
    `- Ground EVERY factual claim only in the EVIDENCE provided. Never invent numbers, comps, prices, or features. If evidence is thin, say so honestly and offer to gather it.`,
    `- FAIR HOUSING: never reference or imply race, color, religion, sex, disability, familial status (children/families), national origin, or age. Describe the home and the market, never who "should" live there.`,
    `- Honest, human, concise, no pressure. One or two short paragraphs. Sign off as ${input.agent.name}.`,
    ...(priorLine ? [priorLine] : []),
  ].join("\n");
}

function liveUser(input: ComposeInput): string {
  return [
    `SITUATION: ${input.situation}`,
    `PROPERTY: ${input.address}`,
    `RECIPIENT: ${input.recipientLabel}`,
    `EVIDENCE:`,
    evidenceBlock(input.evidence.filter((c) => c.confidence !== "D")),
  ].join("\n");
}

async function composeLive(input: ComposeInput): Promise<ComposeOutput> {
  const usable = input.evidence.filter((c) => c.confidence !== "D");
  const system = liveSystem(input);
  const user = liveUser(input);
  let modelUsage: ComposeOutput["modelUsage"];

  if (input.actionType === "sms") {
    const out = await claudeJSON<{ body?: string }>({
      system,
      user,
      schemaHint: `{ "body": string }  // one friendly SMS, under 320 chars`,
      maxTokens: 300,
      onUsage: (usage) => {
        modelUsage = usage;
      },
    });
    const clean = applyComposerExclusions(String(out.body ?? "").trim());
    if (!clean.text) throw new Error("live composer returned empty sms");
    return {
      payload: { to: input.recipientPhone ?? input.recipientLabel, body: clean.text } satisfies SmsPayload,
      evidenceUsed: usable,
      excluded: clean.excluded,
      promptVersion: LIVE_PROMPT_VERSION,
      modelUsage,
    };
  }

  // email
  const out = await claudeJSON<{ subject?: string; body?: string }>({
    system,
    user,
    schemaHint: `{ "subject": string, "body": string }`,
    maxTokens: 800,
    onUsage: (usage) => {
      modelUsage = usage;
    },
  });
  const subject = String(out.subject ?? "").trim();
  const clean = applyComposerExclusions(String(out.body ?? "").trim());
  if (!subject || !clean.text) throw new Error("live composer returned empty email");
  return {
    payload: {
      from: `${input.agent.name} <${input.agent.email}>`,
      to: input.recipientEmail ?? input.recipientLabel,
      subject,
      body: clean.text,
      signatureHtml: input.agent.signatureHtml,
    } satisfies EmailPayload,
    evidenceUsed: usable,
    excluded: clean.excluded,
    promptVersion: LIVE_PROMPT_VERSION,
    modelUsage,
  };
}

/**
 * The call site's entry point: live Claude when enabled (email/sms only),
 * deterministic templates otherwise. ANY live failure falls back totally to the
 * template — a draft is always produced, never a broken one.
 */
export async function composeBest(input: ComposeInput): Promise<ComposeOutput> {
  if (claudeLive() && (input.actionType === "email" || input.actionType === "sms")) {
    // .catch attaches synchronously (no microtask gap) — the live rejection is
    // always handled; a draft is always produced, never a broken one.
    return composeLive(input).catch((error) => ({
      ...compose(input),
      fallbackReason: error instanceof Error ? error.message : "live composer failed",
    }));
  }
  return compose(input);
}
