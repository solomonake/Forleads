import { describe, expect, it } from "vitest";
import { MapillaryImageryProvider } from "./real";

describe("MapillaryImageryProvider", () => {
  it("keeps the original count-only behavior when no vision captioner is provided", async () => {
    const provider = new MapillaryImageryProvider(
      "token",
      undefined,
      (async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: "f1", thumb_1024_url: "https://img/f1.jpg" },
              { id: "f2", thumb_1024_url: "https://img/f2.jpg" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    );

    const cards = await provider.street({
      address: "1 Test St",
      lng: -73.9,
      lat: 40.7,
      scout: "imagery",
    });

    expect(cards).toEqual([
      {
        scout: "imagery",
        claim: "Street imagery",
        value: "2 frames",
        sources: [{ name: "Mapillary", url: "https://mapillary.com" }, { name: "CC-BY-SA" }],
        confidence: "A",
      },
    ]);
  });
});
