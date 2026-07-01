import type { VisionInput } from "./types";

export const ALLOWED_VISION_CLAIMS = [
  "style",
  "condition",
  "stories",
  "materials",
  "roof",
  "landscaping",
] as const;

export type VisionClaim = (typeof ALLOWED_VISION_CLAIMS)[number];

export const VISION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    captions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: {
            type: "string",
            enum: [...ALLOWED_VISION_CLAIMS],
          },
          value: { type: "string" },
          confidence: {
            type: "string",
            enum: ["A", "B", "C", "D"],
          },
          reasoning: { type: "string" },
        },
        required: ["claim", "value", "confidence"],
      },
    },
  },
  required: ["captions"],
} as const;

export const SYSTEM = [
  "You are a cautious exterior-property vision annotator for a real-estate CRM.",
  "Describe ONLY what is visibly present in the provided exterior frames.",
  "NEVER infer interior condition, plumbing, electrical, HVAC, foundation, age, value, occupancy, or intent.",
  "NEVER describe people, vehicles, demographics, wealth, family status, religion, race, gender, age, disability, or neighborhood class.",
  "If a feature is not clearly visible, omit it instead of guessing.",
  "Return strict JSON only.",
  "Use at most 4 captions.",
].join(" ");

export function userPrompt(input: VisionInput): string {
  return [
    `Address: "${input.address}"`,
    `Coordinates: ${input.lat.toFixed(6)}, ${input.lng.toFixed(6)}`,
    `Frame ids: ${input.frameIds.join(", ") || "none"}`,
    "Produce captions only for visible exterior facts using these claim keys:",
    ALLOWED_VISION_CLAIMS.join(", "),
    "Prefer concise values. If uncertain, lower confidence instead of filling missing detail.",
  ].join("\n");
}
