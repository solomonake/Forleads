import { describe, expect, it, vi } from "vitest";
import { GeminiVisionCaptioner } from "./gemini";

function makeImageResponse() {
  return new Response(Buffer.from("image-bytes"), {
    status: 200,
    headers: { "content-type": "image/jpeg" },
  });
}

describe("GeminiVisionCaptioner", () => {
  it("returns validated caption cards on the happy path", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("googleapis")) {
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              captions: [
                {
                  claim: "stories",
                  value: "Two stories visible from facade proportions",
                  confidence: "B",
                },
              ],
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return makeImageResponse();
    });

    const captioner = new GeminiVisionCaptioner("key", "gemini-2.5-flash", fetcher as typeof fetch, 500);
    const cards = await captioner.caption({
      address: "1 Test St",
      lng: -73.9,
      lat: 40.7,
      frameIds: ["a", "b"],
      frameUrls: ["https://img/a.jpg", "https://img/b.jpg"],
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.claim).toBe("Stories (vision)");
  });

  it("retries once on 5xx then succeeds", async () => {
    let apiCalls = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("googleapis")) {
        apiCalls += 1;
        if (apiCalls === 1) {
          return new Response("server error", { status: 503 });
        }
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              captions: [{ claim: "roof", value: "Flat roof visible", confidence: "C" }],
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return makeImageResponse();
    });

    const captioner = new GeminiVisionCaptioner("key", "gemini-2.5-flash", fetcher as typeof fetch, 500);
    const cards = await captioner.caption({
      address: "1 Test St",
      lng: -73.9,
      lat: 40.7,
      frameIds: ["a"],
      frameUrls: ["https://img/a.jpg"],
    });

    expect(apiCalls).toBe(2);
    expect(cards).toHaveLength(1);
  });

  it("does not retry on 4xx failures", async () => {
    let apiCalls = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("googleapis")) {
        apiCalls += 1;
        return new Response("forbidden", { status: 403 });
      }
      return makeImageResponse();
    });

    const captioner = new GeminiVisionCaptioner("key", "gemini-2.5-flash", fetcher as typeof fetch, 500);
    const cards = await captioner.caption({
      address: "1 Test St",
      lng: -73.9,
      lat: 40.7,
      frameIds: ["a"],
      frameUrls: ["https://img/a.jpg"],
    });

    expect(apiCalls).toBe(1);
    expect(cards).toEqual([]);
  });
});
