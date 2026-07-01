import { log } from "@/lib/observability";
import { SYSTEM, VISION_RESPONSE_SCHEMA, userPrompt } from "./prompt";
import { validateCaption } from "./validate";
import type { VisionCaptioner, VisionInput } from "./types";
import type { EvidenceCard } from "@/lib/core/types";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_FRAMES = 3;

type Fetcher = typeof fetch;

function withTimeout<T>(ms: number, body: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return body(controller.signal).finally(() => clearTimeout(timer));
}

function toBase64(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64");
}

function mimeTypeFrom(response: Response, url: string): string {
  const header = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (header) return header;
  if (url.endsWith(".png")) return "image/png";
  if (url.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function parseOutputText(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const outputText = (data as { output_text?: unknown }).output_text;
  return typeof outputText === "string" ? outputText : null;
}

export class GeminiVisionCaptioner implements VisionCaptioner {
  readonly name = "gemini-vision";
  readonly mode = "live" as const;

  constructor(
    private apiKey: string,
    private model: string,
    private fetcher: Fetcher = fetch,
    private timeoutMs = 8000,
  ) {}

  async caption(input: VisionInput): Promise<EvidenceCard[]> {
    const frames = input.frameUrls.slice(0, MAX_FRAMES).map((url, index) => ({
      id: input.frameIds[index] ?? `frame-${index + 1}`,
      url,
    }));
    if (frames.length === 0) return [];

    log("info", "vision.caption.attempt", {
      model: this.model,
      frameCount: frames.length,
    });

    try {
      const imageInputs = await Promise.all(
        frames.map(async (frame) =>
          withTimeout(this.timeoutMs, async (signal) => {
            const response = await this.fetcher(frame.url, { signal });
            if (!response.ok) {
              throw new Error(`frame_fetch_${response.status}`);
            }
            const bytes = await response.arrayBuffer();
            return {
              type: "image",
              data: toBase64(bytes),
              mime_type: mimeTypeFrom(response, frame.url),
            };
          }),
        ),
      );

      const body = {
        model: this.model,
        input: [
          { type: "text", text: `${SYSTEM}\n\n${userPrompt(input)}` },
          ...imageInputs,
        ],
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: VISION_RESPONSE_SCHEMA,
        },
      };

      const data = await this.requestWithRetry(body);
      const outputText = parseOutputText(data);
      if (!outputText) {
        log("warn", "vision.caption.failed", {
          model: this.model,
          code: "missing_output_text",
        });
        return [];
      }

      const cards = validateCaption(JSON.parse(outputText), frames, this.model);
      log("info", "vision.caption.ok", {
        model: this.model,
        frameCount: frames.length,
        claimCount: cards.length,
      });
      return cards;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code =
        /frame_fetch_/.test(message) ? "frame_fetch" :
        /HTTP 4\d\d/.test(message) ? "auth" :
        /HTTP 5\d\d/.test(message) ? "upstream" :
        /AbortError|timeout/i.test(message) ? "timeout" :
        /Unexpected token|JSON/.test(message) ? "json" :
        "unknown";
      log("warn", "vision.caption.failed", {
        model: this.model,
        code,
      });
      return [];
    }
  }

  private async requestWithRetry(body: Record<string, unknown>): Promise<unknown> {
    let attempt = 0;
    while (attempt < 2) {
      attempt += 1;
      const response = await withTimeout(this.timeoutMs, (signal) =>
        this.fetcher(GEMINI_URL, {
          method: "POST",
          signal,
          headers: {
            "x-goog-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      );
      if (response.ok) return response.json();
      if (response.status >= 500 && attempt < 2) continue;
      throw new Error(`HTTP ${response.status}`);
    }
    throw new Error("unreachable");
  }
}
