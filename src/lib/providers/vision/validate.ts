import type { Confidence, EvidenceCard } from "@/lib/core/types";
import { ALLOWED_VISION_CLAIMS, type VisionClaim } from "./prompt";

type RawCaption = {
  claim?: unknown;
  value?: unknown;
  confidence?: unknown;
  reasoning?: unknown;
};

const DISPLAY_CLAIMS: Record<VisionClaim, string> = {
  style: "Style (vision)",
  condition: "Condition (vision)",
  stories: "Stories (vision)",
  materials: "Exterior materials (vision)",
  roof: "Roof form (vision)",
  landscaping: "Landscaping (vision)",
};

const HIDDEN_FACT_RE = /\b(needs?|requires?|replace(?:ment)?|repair|damage|damaged|failing|unsafe|mold|leak|leaking|plumbing|wiring|electrical|hvac|foundation|inside|interior)\b/i;
const DEMOGRAPHIC_RE = /\b(family|families|kids|children|school district|wealthy|poor|income|elderly|young professionals?|religious?|churchgoing|safe neighborhood|unsafe neighborhood|race|ethnic|latino|black|white|asian|disabled|wheelchair)\b/i;

function asConfidence(value: unknown): Confidence | null {
  return value === "A" || value === "B" || value === "C" || value === "D" ? value : null;
}

function sanitizeReasoning(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned ? cleaned : undefined;
}

function isAllowedClaim(value: unknown): value is VisionClaim {
  return typeof value === "string" &&
    (ALLOWED_VISION_CLAIMS as readonly string[]).includes(value);
}

export function validateCaption(
  raw: unknown,
  sourceFrames: { id: string; url: string }[],
  model: string,
): EvidenceCard[] {
  if (!raw || typeof raw !== "object") return [];
  const payload = raw as { captions?: unknown };
  if (!Array.isArray(payload.captions)) return [];

  const cards: EvidenceCard[] = [];
  for (const entry of payload.captions.slice(0, 4)) {
    const caption = entry as RawCaption;
    if (!isAllowedClaim(caption.claim)) continue;
    if (typeof caption.value !== "string") continue;
    const value = caption.value.trim();
    if (!value) continue;
    const reasoning = sanitizeReasoning(caption.reasoning);
    const combined = [value, reasoning ?? ""].join(" ");
    if (HIDDEN_FACT_RE.test(combined) || DEMOGRAPHIC_RE.test(combined)) continue;

    const confidence = asConfidence(caption.confidence);
    if (!confidence) continue;

    cards.push({
      scout: "imagery",
      claim: DISPLAY_CLAIMS[caption.claim],
      value,
      sources: [
        ...sourceFrames.map((frame) => ({
          name: `Mapillary frame ${frame.id}`,
          url: frame.url,
        })),
        { name: `Imagery Scout · Gemini ${model}` },
      ],
      confidence: confidence === "A" ? "C" : confidence,
      reasoning: reasoning
        ? `${reasoning} Visible exterior cues only; not a structural inspection.`
        : "Visible exterior cues only; not a structural inspection.",
    });
  }
  return cards;
}
