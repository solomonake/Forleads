import { afterEach, describe, expect, it } from "vitest";
import {
  GoogleStreetViewImageryProvider,
  LicensedPropertyProvider,
  MapillaryImageryProvider,
  OpenDataPropertyProvider,
  OpenRiskDataProvider,
  OSMPropertyProvider,
  PublicNominatimGeocodeProvider,
} from "./real";
import type { PropertyDataProvider } from "./types";

const originalFetch = globalThis.fetch;
const originalOpenSales = process.env.OPEN_SALES_DATA_URL;
const originalOpenSalesList = process.env.OPEN_SALES_DATA_URLS;
const originalHmlr = process.env.HMLR_PRICE_PAID_URL;
const originalFema = process.env.FEMA_NFHL_URL;
const originalAttom = process.env.ATTOM_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("OPEN_SALES_DATA_URL", originalOpenSales);
  restoreEnv("OPEN_SALES_DATA_URLS", originalOpenSalesList);
  restoreEnv("HMLR_PRICE_PAID_URL", originalHmlr);
  restoreEnv("FEMA_NFHL_URL", originalFema);
  restoreEnv("ATTOM_API_KEY", originalAttom);
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

const basePropertyProvider: PropertyDataProvider = {
  name: "osm",
  mode: "live",
  async hasCoverage() {
    return true;
  },
  async facts() {
    return [
      {
        scout: "property",
        claim: "Land use",
        value: "residential",
        sources: [{ name: "OpenStreetMap", url: "https://openstreetmap.org" }],
        confidence: "B",
      },
    ];
  },
  async comps() {
    return [];
  },
};

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

describe("OpenDataPropertyProvider", () => {
  it("grounds a sale card from a configured open CSV feed", async () => {
    process.env.OPEN_SALES_DATA_URL = "https://example.test/open-sales.csv";
    globalThis.fetch = async () =>
      new Response(
        [
          "address,sale_price,sale_date,source,source_url",
          '"22125 Clarksburg Road","$410,000",2024-05-01,"County open data","https://county.example/sales/1"',
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/csv" } },
      );

    const cards = await new OpenDataPropertyProvider(
      new OSMPropertyProvider(),
      "https://example.test/open-sales.csv",
    ).comps({
      address: "22125 Clarksburg Rd",
      lng: -77.279,
      lat: 39.238,
      scout: "market",
    });

    expect(cards[0]).toMatchObject({
      scout: "market",
      claim: "Open sale record",
      value: "$410,000 on 2024-05-01",
      confidence: "C",
      sources: [{ name: "County open data", url: "https://county.example/sales/1", as_of: "2024-05-01" }],
    });
  });

  it("adds assessor property facts from a configured public property feed", async () => {
    globalThis.fetch = async () =>
      new Response(
        [
          "address,year_built,building_sqft,lot_sqft,use_code,parcel_id,source,source_url,as_of",
          '"22125 Clarksburg Road",1988,2400,8000,Residential,13-001,"County assessor","https://county.example/property/13-001",2026-06-30',
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/csv" } },
      );

    const cards = await new OpenDataPropertyProvider(
      basePropertyProvider,
      [],
      "https://example.test/assessor.csv",
    ).facts({
      address: "22125 Clarksburg Rd",
      lng: -77.279,
      lat: 39.238,
      scout: "property",
    });

    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scout: "property",
          claim: "Year built",
          value: "1988",
          confidence: "B",
          sources: [{ name: "County assessor", url: "https://county.example/property/13-001", as_of: "2026-06-30" }],
        }),
        expect.objectContaining({
          claim: "Building area",
          value: "2400 sq ft",
        }),
        expect.objectContaining({
          claim: "Assessor parcel id",
          value: "13-001",
        }),
      ]),
    );
  });

  it("rejects hallucinated-looking query arguments before fetching records", async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const cards = await new OpenDataPropertyProvider(
      new OSMPropertyProvider(),
      "https://example.test/open-sales.csv",
    ).comps({
      address: "",
      lng: -77.279,
      lat: 999,
      scout: "market",
    });

    expect(called).toBe(false);
    expect(cards[0]).toMatchObject({
      scout: "market",
      claim: "Open sale records",
      value: null,
      confidence: "D",
    });
    expect(cards[0]?.reasoning).toContain("Latitude");
  });

  it("does not turn a future-dated sale row into market evidence", async () => {
    globalThis.fetch = async () =>
      new Response(
        [
          "address,sale_price,sale_date,source,source_url",
          '"22125 Clarksburg Road","$999,000",2099-01-01,"County open data","https://county.example/sales/future"',
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/csv" } },
      );

    const cards = await new OpenDataPropertyProvider(
      new OSMPropertyProvider(),
      "https://example.test/open-sales.csv",
    ).comps({
      address: "22125 Clarksburg Rd",
      lng: -77.279,
      lat: 39.238,
      scout: "market",
    });

    expect(cards[0]).toMatchObject({
      scout: "market",
      claim: "Open sale records",
      value: null,
      confidence: "D",
    });
    expect(cards[0]?.reasoning).toContain("valid past sale date");
  });

  it("does not call SDAT while reading an operator-provided open sales feed", async () => {
    process.env.OPEN_SALES_DATA_URL = "https://example.test/open-sales.csv";
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      return new Response(
        [
          "address,sale_price,sale_date,source,source_url",
          '"22125 Clarksburg Road","$410,000",2024-05-01,"County open data","https://county.example/sales/1"',
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/csv" } },
      );
    };

    await new OpenDataPropertyProvider(new OSMPropertyProvider(), "https://example.test/open-sales.csv").comps({
      address: "22125 Clarksburg Rd",
      lng: -77.279,
      lat: 39.238,
      scout: "market",
    });

    expect(calls.join("\n")).not.toMatch(/sdat\.dat\.maryland\.gov/i);
  });

  it("tries multiple regional open sales feeds before returning a match", async () => {
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("empty")) {
        return new Response(
          ["address,sale_price,sale_date,source,source_url", '"1 Other Road","$1",2020-01-01,"Other","https://example.test/other"'].join("\n"),
          { status: 200, headers: { "Content-Type": "text/csv" } },
        );
      }
      return new Response(
        [
          "address,sale_price,sale_date,source,source_url",
          '"22125 Clarksburg Road","$425,000",2025-01-02,"US county feed","https://county.example/sales/2"',
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/csv" } },
      );
    };

    const cards = await new OpenDataPropertyProvider(new OSMPropertyProvider(), [
      "https://example.test/empty.csv",
      "https://example.test/us-sales.csv",
    ]).comps({
      address: "22125 Clarksburg Rd",
      lng: -77.279,
      lat: 39.238,
      scout: "market",
    });

    expect(calls).toEqual(["https://example.test/empty.csv", "https://example.test/us-sales.csv"]);
    expect(cards[0]).toMatchObject({
      value: "$425,000 on 2025-01-02",
      sources: [{ name: "US county feed", url: "https://county.example/sales/2" }],
    });
  });

  it("normalizes no-header HM Land Registry price-paid CSV rows", async () => {
    globalThis.fetch = async () =>
      new Response(
        [
          [
            "{txn}",
            "900000",
            "2024-03-12 00:00",
            "NW1 6XE",
            "F",
            "N",
            "L",
            "221B",
            "",
            "BAKER STREET",
            "MARYLEBONE",
            "LONDON",
            "CITY OF WESTMINSTER",
            "GREATER LONDON",
            "A",
            "A",
          ]
            .map((cell) => `"${cell}"`)
            .join(","),
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/csv" } },
      );

    const cards = await new OpenDataPropertyProvider(new OSMPropertyProvider(), "https://example.test/hmlr.csv").comps({
      address: "221B Baker Street London",
      lng: -0.157,
      lat: 51.523,
      scout: "market",
    });

    expect(cards[0]).toMatchObject({
      scout: "market",
      claim: "Open sale record",
      value: "900000 on 2024-03-12",
      confidence: "C",
      sources: [
        {
          name: "HM Land Registry Price Paid Data",
          url: "https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads",
        },
      ],
    });
  });

  it("returns an honest D gap when no open feed is configured", async () => {
    delete process.env.OPEN_SALES_DATA_URL;

    const cards = await new OpenDataPropertyProvider(new OSMPropertyProvider(), []).comps({
      address: "1 Missing Feed Road",
      lng: 0,
      lat: 0,
      scout: "market",
    });

    expect(cards[0]?.confidence).toBe("D");
    expect(cards[0]?.reasoning).toContain("Public sale records don't cover this market yet");
  });

  it("treats placeholder env values as not configured instead of failing every fetch", async () => {
    const provider = new OpenDataPropertyProvider(
      new OSMPropertyProvider(),
      "<your public sales CSV/JSON URL>",
    );

    expect(await provider.hasCoverage()).toBe(false);

    const cards = await provider.comps({
      address: "22125 Clarksburg Road",
      lng: -77.28,
      lat: 39.23,
      scout: "market",
    });
    // Falls into the honest "not configured" gap, not the "unreachable" retry path.
    expect(cards[0]?.confidence).toBe("D");
    expect(cards[0]?.reasoning).toContain("don't cover this market yet");
  });
});

describe("MapillaryImageryProvider", () => {
  it("returns image media and capture freshness for available frames", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "123",
              thumb_1024_url: "https://images.mapillary.com/123/thumb-1024.jpg",
              captured_at: "2026-06-15T12:00:00Z",
            },
            {
              id: "456",
              thumb_1024_url: "https://images.mapillary.com/456/thumb-1024.jpg",
              captured_at: "2026-05-10T12:00:00Z",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const cards = await new MapillaryImageryProvider("token").street({
      address: "22125 Clarksburg Rd",
      lng: -77.279,
      lat: 39.238,
      scout: "imagery",
    });

    expect(cards[0]).toMatchObject({
      scout: "imagery",
      claim: "Street imagery",
      value: "2 frames",
      confidence: "A",
    });
    expect(cards[0]?.sources).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Mapillary", as_of: "2026-06-15" })]),
    );
    expect(cards[0]?.media).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "image",
          url: "https://images.mapillary.com/123/thumb-1024.jpg",
          captured_at: "2026-06-15",
          attribution: "© Mapillary contributors, CC-BY-SA",
        }),
      ]),
    );
  });
});

describe("GoogleStreetViewImageryProvider", () => {
  it("returns real image media through the server-side image proxy when metadata is OK", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: "OK",
          date: "2026-05",
          copyright: "© 2026 Google",
          pano_id: "pano-123",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const cards = await new GoogleStreetViewImageryProvider("key").street({
      address: "22125 Clarksburg Rd",
      lng: -77.279,
      lat: 39.238,
      scout: "imagery",
    });

    expect(cards[0]).toMatchObject({
      scout: "imagery",
      claim: "Street imagery",
      value: "Google Street View · 2026-05",
      confidence: "A",
      sources: [{ name: "Google Street View", as_of: "2026-05" }],
      media: [
        {
          kind: "image",
          url: "/api/imagery/google-street-view?lat=39.238&lng=-77.279",
          source: "Google Street View",
          captured_at: "2026-05",
          attribution: "© 2026 Google",
        },
      ],
    });
  });

  it("returns an honest D gap when Google has no street-view imagery", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ status: "ZERO_RESULTS" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const cards = await new GoogleStreetViewImageryProvider("key").street({
      address: "No imagery point",
      lng: -77.279,
      lat: 39.238,
      scout: "imagery",
    });

    expect(cards[0]).toMatchObject({
      scout: "imagery",
      claim: "Street imagery",
      value: null,
      confidence: "D",
    });
    expect(cards[0]?.reasoning).toContain("ZERO_RESULTS");
  });
});

describe("LicensedPropertyProvider", () => {
  it("fails closed when a licensed source is selected without credentials", async () => {
    delete process.env.ATTOM_API_KEY;

    const provider = new LicensedPropertyProvider("attom", basePropertyProvider);
    const cards = await provider.comps({
      address: "22125 Clarksburg Rd",
      lng: -77.279,
      lat: 39.238,
      scout: "market",
    });

    expect(await provider.hasCoverage(-77.279, 39.238)).toBe(false);
    expect(cards[0]).toMatchObject({
      scout: "market",
      claim: "ATTOM valuation/comparable-sales context",
      value: null,
      confidence: "D",
    });
    expect(cards[0]?.reasoning).toContain("ATTOM_API_KEY");
  });

  it("does not invent values even when credentials exist before response mapping is implemented", async () => {
    process.env.ATTOM_API_KEY = "test-key";

    const provider = new LicensedPropertyProvider("attom", basePropertyProvider);
    const cards = await provider.comps({
      address: "22125 Clarksburg Rd",
      lng: -77.279,
      lat: 39.238,
      scout: "market",
    });

    expect(await provider.hasCoverage(-77.279, 39.238)).toBe(true);
    expect(cards[0]).toMatchObject({
      value: null,
      confidence: "D",
    });
    expect(cards[0]?.reasoning).toContain("response mapping");
  });
});

describe("OpenRiskDataProvider", () => {
  it("grounds a FEMA NFHL flood card from a queryable ArcGIS layer", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          features: [
            {
              attributes: {
                FLD_ZONE: "AE",
                ZONE_SUBTY: "1 PCT ANNUAL CHANCE FLOOD HAZARD",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const cards = await new OpenRiskDataProvider("https://fema.example/NFHL/MapServer/28/query", []).hazards({
      address: "22125 Clarksburg Rd",
      lng: -77.279,
      lat: 39.238,
      scout: "risk",
    });

    expect(cards[0]).toMatchObject({
      scout: "risk",
      claim: "Flood risk",
      value: "FEMA NFHL AE · 1 PCT ANNUAL CHANCE FLOOD HAZARD",
      confidence: "B",
      sources: [{ name: "FEMA NFHL", url: "https://fema.example/NFHL/MapServer/28/query" }],
    });
  });

  it("grounds a public distress card from an open CSV feed", async () => {
    globalThis.fetch = async () =>
      new Response(
        [
          "address,record_type,date,source,source_url",
          '"22125 Clarksburg Road","code violation",2026-01-15,"Open county data","https://county.example/code/1"',
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/csv" } },
      );

    const cards = await new OpenRiskDataProvider([], ["https://county.example/code.csv"]).distress({
      address: "22125 Clarksburg Rd",
      lng: -77.279,
      lat: 39.238,
      scout: "risk",
    });

    expect(cards[0]).toMatchObject({
      scout: "risk",
      claim: "Open distress signal",
      value: "code violation · 2026-01-15",
      confidence: "C",
      sources: [{ name: "Open county data", url: "https://county.example/code/1" }],
    });
  });
});
