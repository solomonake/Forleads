import { describe, expect, it } from "vitest";
import { MapillaryImageryProvider } from "@/lib/providers/real";
import type { VisionCaptioner } from "./types";

function mapillaryResponse() {
  return new Response(
    JSON.stringify({
      data: [
        { id: "f1", thumb_1024_url: "https://img/f1.jpg" },
        { id: "f2", thumb_1024_url: "https://img/f2.jpg" },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("Mapillary imagery + vision integration", () => {
  it("returns the count card plus caption cards when vision succeeds", async () => {
    const vision: VisionCaptioner = {
      name: "mock-vision",
      mode: "mock",
      caption: async () => [
        {
          scout: "imagery",
          claim: "Roof form (vision)",
          value: "Pitched roof visible",
          sources: [{ name: "Mapillary frame f1", url: "https://img/f1.jpg" }, { name: "Imagery Scout · mock vision" }],
          confidence: "C",
        },
      ],
    };
    const provider = new MapillaryImageryProvider(
      "token",
      vision,
      (async () => mapillaryResponse()) as typeof fetch,
    );

    const cards = await provider.street({
      address: "1 Test St",
      lng: -73.9,
      lat: 40.7,
      scout: "imagery",
    });

    expect(cards).toHaveLength(2);
    expect(cards[0]?.claim).toBe("Street imagery");
    expect(cards[1]?.claim).toBe("Roof form (vision)");
  });

  it("falls back to the count-only card when vision throws", async () => {
    const vision: VisionCaptioner = {
      name: "broken-vision",
      mode: "live",
      caption: async () => {
        throw new Error("boom");
      },
    };
    const provider = new MapillaryImageryProvider(
      "token",
      vision,
      (async () => mapillaryResponse()) as typeof fetch,
    );

    const cards = await provider.street({
      address: "1 Test St",
      lng: -73.9,
      lat: 40.7,
      scout: "imagery",
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.claim).toBe("Street imagery");
  });
});
