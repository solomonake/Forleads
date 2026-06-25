import { afterEach, describe, expect, it } from "vitest";
import { PublicNominatimGeocodeProvider } from "./real";

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
