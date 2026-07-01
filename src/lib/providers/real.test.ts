import { afterEach, describe, expect, it } from "vitest";
import { FemaNfhlRiskProvider, PublicNominatimGeocodeProvider } from "./real";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("PublicNominatimGeocodeProvider", () => {
  it("deduplicates equivalent search results", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify([
          {
            lon: "32.5825200",
            lat: "0.3475960",
            display_name: "Kampala, Central Region, Uganda",
            address: {
              city: "Kampala",
              state: "Central Region",
              country: "Uganda",
            },
          },
          {
            lon: "32.5825200",
            lat: "0.3475960",
            display_name: "Kampala, Central Region, Uganda",
            address: {
              city: "Kampala",
              state: "Central Region",
              country: "Uganda",
            },
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const results = await new PublicNominatimGeocodeProvider().autocomplete("kampala");

    expect(results).toEqual([
      {
        address: "Kampala",
        locality: "Kampala, Central Region, Uganda",
        lng: 32.58252,
        lat: 0.347596,
      },
    ]);
  });
});

describe("FemaNfhlRiskProvider", () => {
  const query = {
    lng: -95.3979,
    lat: 29.7858,
    address: "Houston Heights, Houston, TX",
  };

  it("grounds a flood-zone card from an NFHL feature", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          features: [
            {
              attributes: {
                FLD_ZONE: "AE",
                ZONE_SUBTY: "1 PCT ANNUAL CHANCE FLOOD HAZARD",
                SFHA_TF: "T",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const cards = await new FemaNfhlRiskProvider("https://fema.example/query").flood(query);

    expect(cards).toMatchObject([
      {
        scout: "risk",
        claim: "Flood zone",
        value: "AE — high-risk SFHA · 1 PCT ANNUAL CHANCE FLOOD HAZARD",
        sources: [{ name: "FEMA NFHL" }],
        confidence: "A",
      },
    ]);
    expect(cards[0]?.sources[0]?.url).toContain("geometry=-95.3979%2C29.7858");
  });

  it("returns a cited grade-D gap when NFHL has no feature at the point", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ features: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const cards = await new FemaNfhlRiskProvider("https://fema.example/query").flood(query);

    expect(cards).toMatchObject([
      {
        claim: "Flood zone",
        value: null,
        sources: [{ name: "FEMA NFHL" }],
        confidence: "D",
      },
    ]);
    expect(cards[0]?.reasoning).toContain("outside FEMA NFHL coverage");
  });

  it("returns a cited grade-D gap on non-200 responses", async () => {
    globalThis.fetch = async () => new Response("maintenance", { status: 503 });

    const cards = await new FemaNfhlRiskProvider("https://fema.example/query").flood(query);

    expect(cards[0]).toMatchObject({
      claim: "Flood zone",
      value: null,
      confidence: "D",
      reasoning: "FEMA NFHL request failed with HTTP 503.",
    });
  });

  it("returns a cited grade-D gap on network rejection without a vi.fn rejection", async () => {
    globalThis.fetch = async () => {
      throw new Error("network down");
    };

    const cards = await new FemaNfhlRiskProvider("https://fema.example/query").flood(query);

    expect(cards[0]).toMatchObject({
      claim: "Flood zone",
      value: null,
      confidence: "D",
      reasoning: "Network error reaching FEMA NFHL.",
    });
  });
});
