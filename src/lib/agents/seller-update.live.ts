import type { EmailPayload } from "@/lib/core/types";
import { claudeLive } from "@/lib/core/config";
import { claudeJSON } from "./claude";
import {
  applyComposerExclusions,
  compose,
  type ComposeInput,
  type ComposeOutput,
} from "./composer";

const LIVE_PROMPT_VERSION = "seller-update-live-1.0.0";

function themeBlock(input: ComposeInput): string {
  const ctx = input.sellerUpdate;
  if (!ctx) return "(no seller-update themes supplied)";
  return ctx.themes
    .map(
      (theme) =>
        `- ${theme.label}: ${theme.mentions} of ${ctx.showingsCounted} notes, confidence ${theme.confidence}, noteIds=${theme.supportingNoteIds.join(",")}`,
    )
    .join("\n");
}

async function composeSellerUpdateLive(input: ComposeInput): Promise<ComposeOutput> {
  const deterministic = compose(input);
  let modelUsage: ComposeOutput["modelUsage"];
  const system = [
    `You are ${input.agent.name}, a real-estate agent writing a seller update after recent showings.`,
    `Rules:`,
    `- Use ONLY the deterministic feedback themes supplied. Do not add facts, numbers, comps, or buyer demographics.`,
    `- Keep the note concise, calm, and honest. No pressure, no auto-send language.`,
    `- Fair housing: never mention protected classes, family status, age, religion, national origin, disability, sex, race, or color.`,
    `- Return JSON with subject and body only.`,
  ].join("\n");
  const out = await claudeJSON<{ subject?: string; body?: string }>({
    system,
    user: [
      `PROPERTY: ${input.address}`,
      `SELLER: ${input.recipientLabel}`,
      `BRAND VOICE: ${input.agent.brandVoice}`,
      `DETERMINISTIC THEMES:`,
      themeBlock(input),
      `BASE DRAFT:`,
      JSON.stringify(deterministic.payload),
    ].join("\n"),
    schemaHint: `{ "subject": string, "body": string }`,
    maxTokens: 350,
    onUsage: (usage) => {
      modelUsage = usage;
    },
  });
  const subject = String(out.subject ?? "").trim();
  const clean = applyComposerExclusions(String(out.body ?? "").trim());
  if (!subject || !clean.text) throw new Error("live seller-update returned empty email");
  return {
    payload: {
      from: `${input.agent.name} <${input.agent.email}>`,
      to: input.recipientEmail ?? input.recipientLabel,
      subject,
      body: clean.text,
      signatureHtml: input.agent.signatureHtml,
    } satisfies EmailPayload,
    evidenceUsed: deterministic.evidenceUsed,
    excluded: [...deterministic.excluded, ...clean.excluded],
    promptVersion: LIVE_PROMPT_VERSION,
    modelUsage,
  };
}

export async function composeSellerUpdateBest(input: ComposeInput): Promise<ComposeOutput> {
  if (claudeLive() && input.actionType === "email") {
    return composeSellerUpdateLive(input).catch((error) => ({
      ...compose(input),
      fallbackReason: error instanceof Error ? error.message : "live seller-update failed",
    }));
  }
  return compose(input);
}
