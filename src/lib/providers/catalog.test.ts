import { afterEach, describe, expect, it } from "vitest";
import type { PropertyQuery } from "./types";
import {
  addressesMatch,
  catalogCovers,
  catalogHazardEndpoints,
  catalogSourcesAt,
  OPEN_DATA_CATALOG,
  queryCatalogDistress,
  queryCatalogSales,
} from "./catalog";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const NYC: PropertyQuery = { address: "272 East 3 Street, Manhattan", lng: -73.984, lat: 40.722, scout: "market" };
const LONDON: PropertyQuery = { address: "221B Baker Street, London NW1 6XE", lng: -0.157, lat: 51.523, scout: "market" };
const KAMPALA: PropertyQuery = { address: "Plot 4 Kira Road, Kampala", lng: 32.582, lat: 0.347, scout: "market" };
const VANCOUVER: PropertyQuery = { address: "402 Alberta St, Vancouver", lng: -123.114, lat: 49.264, scout: "market" };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("catalog coverage", () => {
  it("every entry has a plausible bbox, license, homepage, and verified date", () => {
    for (const source of OPEN_DATA_CATALOG) {
      expect(source.bbox[0], source.id).toBeLessThan(source.bbox[2]);
      expect(source.bbox[1], source.id).toBeLessThan(source.bbox[3]);
      expect(source.license, source.id).not.toBe("");
      expect(source.homepage, source.id).toMatch(/^https:\/\//);
      expect(source.verified, source.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("selects sources by point: NYC gets sales+distress, Kampala gets none", () => {
    const nyc = catalogSourcesAt(NYC.lng, NYC.lat, ["sales", "distress"]).map((s) => s.id);
    expect(nyc).toContain("nyc-rolling-sales");
    expect(nyc).toContain("nyc-hpd-violations");
    expect(nyc).not.toContain("chicago-building-violations");

    expect(catalogCovers(KAMPALA.lng, KAMPALA.lat, ["sales", "assessment", "distress"])).toBe(false);
  });

  it("routes hazards by region: FEMA for US points, EA for England points", () => {
    const us = catalogHazardEndpoints(-95.36, 29.76).map((e) => e.name);
    expect(us).toEqual(["FEMA NFHL"]);

    const england = catalogHazardEndpoints(LONDON.lng, LONDON.lat).map((e) => e.name);
    expect(england).toContain("EA Flood Zone 3");
    expect(england).toContain("EA Flood Zone 2");
    expect(england).not.toContain("FEMA NFHL");
  });
});

describe("addressesMatch", () => {
  it("matches abbreviated street types and rejects different house numbers", () => {
    expect(addressesMatch("272 EAST 3 STREET", "272 East 3 St")).toBe(true);
    expect(addressesMatch("274 EAST 3 STREET", "272 East 3 Street")).toBe(false);
    expect(addressesMatch("", "272 East 3 Street")).toBe(false);
  });
});

describe("queryCatalogSales", () => {
  it("queries Socrata with the street part and returns only address-matched records", async () => {
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      return jsonResponse([
        { address: "272 EAST 3 STREET", sale_price: "3100000", sale_date: "2025-11-02T00:00:00.000" },
        { address: "999 SOMEWHERE ELSE", sale_price: "1", sale_date: "2020-01-01T00:00:00.000" },
      ]);
    };

    const matches = await queryCatalogSales(NYC);

    const socrataCall = calls.find((c) => c.includes("data.cityofnewyork.us"));
    expect(socrataCall).toContain(encodeURIComponent("272 East 3 Street"));
    expect(socrataCall).toContain("$limit=25");
    const nycMatches = matches.filter((m) => m.source.id === "nyc-rolling-sales");
    expect(nycMatches).toHaveLength(1);
    expect(nycMatches[0]).toMatchObject({ amount: "3100000", date: "2025-11-02" });
  });

  it("escapes quotes in CARTO SQL string literals", async () => {
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      calls.push(decodeURIComponent(String(input)));
      return jsonResponse({ rows: [] });
    };

    await queryCatalogSales({
      address: "12 O'Hara Street, Philadelphia",
      lng: -75.16,
      lat: 39.95,
      scout: "market",
    });

    const carto = calls.find((c) => c.includes("phl.carto.com"));
    expect(carto).toContain("O''Hara");
    expect(carto).not.toContain("O'Hara St'");
  });

  it("queries HMLR by postcode and formats the price paid", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("landregistry.data.gov.uk")) {
        expect(url).toContain("propertyAddress.postcode=NW1%206XE");
        return jsonResponse({
          result: {
            items: [
              {
                pricePaid: 900000,
                transactionDate: "2024-03-12",
                propertyAddress: { paon: "221B", street: "BAKER STREET", town: "LONDON", postcode: "NW1 6XE" },
              },
            ],
          },
        });
      }
      return jsonResponse([]);
    };

    const matches = await queryCatalogSales(LONDON);

    const hmlr = matches.filter((m) => m.source.id === "hmlr-price-paid");
    expect(hmlr).toHaveLength(1);
    expect(hmlr[0]).toMatchObject({ amount: "£900,000", date: "2024-03-12" });
  });

  it("skips HMLR when the address has no postcode instead of guessing", async () => {
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      return jsonResponse([]);
    };

    await queryCatalogSales({ address: "221B Baker Street, London", lng: -0.157, lat: 51.523, scout: "market" });

    expect(calls.filter((c) => c.includes("landregistry"))).toHaveLength(0);
  });

  it("sums Vancouver land + improvement into one assessed value", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("opendata.vancouver.ca")) {
        return jsonResponse({
          results: [
            {
              from_civic_number: "402",
              street_name: "ALBERTA ST",
              current_land_value: 537000,
              current_improvement_value: 172000,
              tax_assessment_year: "2026",
            },
          ],
        });
      }
      return jsonResponse([]);
    };

    const matches = await queryCatalogSales(VANCOUVER);

    const van = matches.filter((m) => m.source.id === "vancouver-property-tax");
    expect(van).toHaveLength(1);
    expect(van[0]).toMatchObject({ amount: "709000", date: "2026" });
    expect(van[0]!.source.kind).toBe("assessment");
  });

  it("a failing source contributes nothing instead of sinking the batch", async () => {
    globalThis.fetch = async () => {
      throw new Error("network down");
    };

    const matches = await queryCatalogSales(NYC);

    expect(matches).toEqual([]);
  });
});

describe("queryCatalogDistress", () => {
  it("composes multi-part addresses (NYC HPD) and labels violations", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("wvxf-dwi5")) {
        return jsonResponse([
          {
            housenumber: "272",
            streetname: "EAST 3 STREET",
            boro: "MANHATTAN",
            novdescription: "§ 27-2005 ADM CODE REPAIR THE BROKEN WINDOW",
            inspectiondate: "2026-02-14T00:00:00.000",
          },
        ]);
      }
      return jsonResponse([]);
    };

    const matches = await queryCatalogDistress(NYC);

    const hpd = matches.filter((m) => m.source.id === "nyc-hpd-violations");
    expect(hpd).toHaveLength(1);
    expect(hpd[0]).toMatchObject({ date: "2026-02-14" });
    expect(hpd[0]!.label).toContain("REPAIR THE BROKEN WINDOW");
  });
});

describe("Maryland built-in pack (socrata-eq)", () => {
  const CLARKSBURG: PropertyQuery = {
    address: "22125 Clarksburg Road, Clarksburg",
    lng: -77.28,
    lat: 39.24,
    scout: "market",
  };

  it("queries SDAT by uppercase USPS-abbreviated equality and normalizes dot dates", async () => {
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (new URL(url).host === "opendata.maryland.gov" && url.includes("sale_price")) {
        return jsonResponse([
          { address: "22125 CLARKSBURG RD", city: "CLARKSBURG", sale_price: "658120", sale_date: "2021.12.13" },
        ]);
      }
      return jsonResponse([]);
    };

    const matches = await queryCatalogSales(CLARKSBURG);

    const sdatCall = calls.find((c) => new URL(c).host === "opendata.maryland.gov");
    expect(sdatCall).toContain("mdp_street_address_mdp_field_address=22125+CLARKSBURG+RD");
    expect(sdatCall).toContain("%24limit=25");
    const sales = matches.filter((m) => m.source.id === "maryland-sdat-sales");
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ amount: "658120", date: "2021-12-13" });
  });

  it("falls back to the raw uppercase street when the abbreviated form has no rows", async () => {
    const sdatCalls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (new URL(url).host === "opendata.maryland.gov" && url.includes("sale_price")) {
        sdatCalls.push(decodeURIComponent(url).replace(/\+/g, " "));
        if (url.includes("22125+CLARKSBURG+ROAD")) {
          return jsonResponse([
            { address: "22125 CLARKSBURG ROAD", city: "CLARKSBURG", sale_price: "500000", sale_date: "2019.05.01" },
          ]);
        }
        return jsonResponse([]);
      }
      return jsonResponse([]);
    };

    const matches = await queryCatalogSales(CLARKSBURG);

    expect(sdatCalls.some((c) => c.includes("22125 CLARKSBURG RD"))).toBe(true);
    expect(sdatCalls.some((c) => c.includes("22125 CLARKSBURG ROAD"))).toBe(true);
    const sales = matches.filter((m) => m.source.id === "maryland-sdat-sales");
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ amount: "500000", date: "2019-05-01" });
  });

  it("grounds Montgomery County code violations with composed address and filed date", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (new URL(url).host === "data.montgomerycountymd.gov") {
        return jsonResponse([
          {
            street_address: "22125 CLARKSBURG RD",
            city: "CLARKSBURG",
            condition: "General Condition",
            date_filed: "2026-06-09T00:00:00.000",
          },
          { street_address: "13610 LITTLE SENECA PKWY", city: "CLARKSBURG", condition: "Door", date_filed: "2026-06-03T00:00:00.000" },
        ]);
      }
      return jsonResponse([]);
    };

    const matches = await queryCatalogDistress(CLARKSBURG);

    const mont = matches.filter((m) => m.source.id === "montgomery-md-code-violations");
    expect(mont).toHaveLength(1);
    expect(mont[0]).toMatchObject({ label: "General Condition", date: "2026-06-09" });
  });
});
