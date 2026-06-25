// ============================================================================
// The ONE Anthropic client. SERVER-ONLY (reads ANTHROPIC_API_KEY via config).
//
// `claudeJSON` is the single seam every live-Claude caller goes through: it
// returns parsed JSON of the requested shape, or THROWS `ClaudeError` so the
// caller can fall back to its deterministic path. It NEVER returns a partial or
// broken result. Callers gate on `claudeLive()` and import this module lazily
// (dynamic import) so the SDK is never loaded in mock mode.
//
// Cost posture (constitution §10): low max_tokens, prompt-cache the static
// system block, one retry, hard timeout. Claude REASONS; it never invents the
// numbers — facts come only from the grounded evidence the caller passes in.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/core/config";

/** Typed error so every caller can `catch` and fall back to templates. */
export class ClaudeError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ClaudeError";
  }
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!config.anthropicKey) throw new ClaudeError("ANTHROPIC_API_KEY not set");
  if (!client) {
    // One retry + a tight timeout keep a slow/flaky call from stalling a draft;
    // any failure surfaces as ClaudeError → deterministic fallback.
    client = new Anthropic({ apiKey: config.anthropicKey, maxRetries: 1, timeout: 15_000 });
  }
  return client;
}

export interface ClaudeJSONInput {
  /** Static, cacheable instruction block (brand voice, rules). */
  system: string;
  /** Per-request content (the note / situation / evidence) — varies each call. */
  user: string;
  /** Shape the model must return, e.g. `{ "subject": string, "body": string }`. */
  schemaHint: string;
  /** Hard output cap. Keep low — these are short drafts/classifications. */
  maxTokens?: number;
  onUsage?: (usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  }) => void;
}

/** Tolerant JSON extraction — strips code fences / stray prose, then parses. */
function extractJSON(text: string): unknown {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const first = stripped.indexOf("{");
    const last = stripped.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(stripped.slice(first, last + 1));
    }
    throw new ClaudeError("No JSON object found in Claude response");
  }
}

export async function claudeJSON<T>(input: ClaudeJSONInput): Promise<T> {
  const c = getClient();
  try {
    const msg = await c.messages.create({
      model: config.claudeModel,
      max_tokens: input.maxTokens ?? 700,
      // Static rules first (cacheable prefix); volatile content goes in messages.
      system: [
        {
          type: "text",
          text: `${input.system}\n\nReturn ONLY a JSON object of this exact shape — no prose, no markdown fences:\n${input.schemaHint}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: input.user }],
    });
    input.onUsage?.({
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
    });

    if (msg.stop_reason === "refusal") {
      throw new ClaudeError("Claude declined the request");
    }
    const block = msg.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new ClaudeError("No text block in Claude response");
    }
    return extractJSON(block.text) as T;
  } catch (e) {
    if (e instanceof ClaudeError) throw e;
    throw new ClaudeError(e instanceof Error ? e.message : "Claude request failed", e);
  }
}
