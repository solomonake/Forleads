import { config, visionLive } from "@/lib/core/config";
import type { VisionCaptioner } from "./types";
import { GeminiVisionCaptioner } from "./gemini";
import { MockVisionCaptioner } from "./mock";

export function getVisionCaptioner(): VisionCaptioner | null {
  if (config.visionProvider === "mock") return new MockVisionCaptioner();
  if (visionLive() && config.geminiKey) {
    return new GeminiVisionCaptioner(config.geminiKey, config.visionModel);
  }
  return null;
}

export * from "./types";
