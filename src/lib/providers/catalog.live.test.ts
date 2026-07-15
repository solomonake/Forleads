// ============================================================================
// LIVE catalog verification — opt-in (LIVE_CATALOG=1), hits the real public
// endpoints. Run this when touching the catalog or on a schedule to catch
// source rot: a dead feed should fail HERE, not silently degrade production.
//   LIVE_CATALOG=1 npx vitest run src/lib/providers/catalog.live.test.ts
// ============================================================================

import { describe, expect, it } from "vitest";
import type { PropertyQuery } from "./types";
import { queryCatalogDistress, queryCatalogSales } from "./catalog";
import { OpenDataPropertyProvider, OpenRiskDataProvider, OSMPropertyProvider } from "./real";

const live = process.env.LIVE_CATALOG === "1";

function q(address: string, lng: number, lat: number): PropertyQuery {
  return { address, lng, lat, scout: "market" };
}

// Addresses below were confirmed present in each dataset when the catalog
// entry was verified. If one drops out of a rolling window, refresh it from
// the dataset rather than loosening the assertion.
describe.runIf(live)("catalog live verification", () => {
  it("NYC rolling sales grounds a real sale", async () => {
    const matches = await queryCatalogSales(q("272 East 3 Street, Manhattan", -73.981, 40.721));
    expect(matches.some((m) => m.source.id === "nyc-rolling-sales" && m.amount)).toBe(true);
  }, 20000);

  it("Philadelphia OPA grounds a real sale", async () => {
    const matches = await queryCatalogSales(q("4153 Dungan St, Philadelphia", -75.09, 40.01));
    expect(matches.some((m) => m.source.id === "philadelphia-opa-sales" && m.amount)).toBe(true);
  }, 20000);

  it("Chicago building violations ground a real distress signal", async () => {
    const matches = await queryCatalogDistress(q("6558 S Ashland Ave, Chicago", -87.664, 41.774));
    expect(matches.some((m) => m.source.id === "chicago-building-violations")).toBe(true);
  }, 20000);

  it("Maryland SDAT grounds a real sale and assessment for a Clarksburg parcel", async () => {
    const matches = await queryCatalogSales(q("22125 Clarksburg Road, Clarksburg, MD", -77.28, 39.24));
    expect(matches.some((m) => m.source.id === "maryland-sdat-sales" && m.amount)).toBe(true);
    expect(matches.some((m) => m.source.id === "maryland-sdat-assessments" && m.amount)).toBe(true);
  }, 30000);

  it("Oklahoma County grounds a valid recorded sale and current assessment at the parcel point", async () => {
    const input = q("2209 Colchester Ter, Edmond, OK", -97.4503494061, 35.6421376231);
    const matches = await queryCatalogSales(input);
    const sale = matches.find((m) => m.source.id === "oklahoma-county-sales");
    const assessment = matches.find((m) => m.source.id === "oklahoma-county-assessments");
    expect(sale?.amount).toBe("389000");
    expect(sale?.date).toBe("2026-07-08");
    expect(assessment?.amount).toBe("364500");
    expect(assessment?.date).toBe("2026-07-08");

    const cards = await new OpenDataPropertyProvider(new OSMPropertyProvider(), []).comps(input);
    expect(cards.find((card) => card.claim === "Open sale record")).toMatchObject({
      confidence: "C",
      sources: [{ as_of: "2026-07-08" }],
    });
    expect(cards.find((card) => card.claim === "Assessed value")).toMatchObject({
      confidence: "B",
      sources: [{ as_of: "2026-07-08" }],
    });
  }, 30000);

  it("Montgomery County code violations ground a real distress signal", async () => {
    // Self-grounding: pull one live row, then prove the pipeline finds it.
    const seed = (await (
      await fetch(
        "https://data.montgomerycountymd.gov/resource/k9nj-z35d.json?$limit=1&$where=street_address IS NOT NULL AND city IS NOT NULL",
        { headers: { "User-Agent": "Forleads/1.0 (live catalog check)", Accept: "application/json" } },
      )
    ).json()) as { street_address?: string; city?: string }[];
    const row = seed[0];
    expect(row?.street_address, "dataset no longer returns addressed rows").toBeTruthy();
    const matches = await queryCatalogDistress(
      q(`${row!.street_address}, ${row!.city}`, -77.2, 39.15),
    );
    expect(matches.some((m) => m.source.id === "montgomery-md-code-violations")).toBe(true);
  }, 30000);

  it("Connecticut OPM sales ground a real sale", async () => {
    const matches = await queryCatalogSales(q("323 Beaver St, Ansonia, CT", -73.068, 41.35));
    expect(matches.some((m) => m.source.id === "connecticut-sales" && m.amount)).toBe(true);
  }, 30000);

  it("NY State assessment rolls ground a real full market value", async () => {
    const matches = await queryCatalogSales(q("135 Willow St, Albany, NY", -73.76, 42.66));
    expect(matches.some((m) => m.source.id === "ny-state-assessments" && m.amount)).toBe(true);
  }, 30000);

  it("New Orleans code violations ground a real distress signal", async () => {
    const seed = (await (
      await fetch("https://data.nola.gov/resource/3ehi-je3s.json?$limit=1&$where=location IS NOT NULL", {
        headers: { "User-Agent": "Forleads/1.0 (live catalog check)", Accept: "application/json" },
      })
    ).json()) as { location?: string }[];
    expect(seed[0]?.location, "dataset no longer returns addressed rows").toBeTruthy();
    const matches = await queryCatalogDistress(q(`${seed[0]!.location}, New Orleans`, -90.07, 29.95));
    expect(matches.some((m) => m.source.id === "nola-code-violations")).toBe(true);
  }, 30000);

  it("Cincinnati code enforcement grounds a real distress signal", async () => {
    const seed = (await (
      await fetch("https://data.cincinnati-oh.gov/resource/cncm-znd6.json?$limit=1&$where=full_address IS NOT NULL", {
        headers: { "User-Agent": "Forleads/1.0 (live catalog check)", Accept: "application/json" },
      })
    ).json()) as { full_address?: string }[];
    expect(seed[0]?.full_address, "dataset no longer returns addressed rows").toBeTruthy();
    const matches = await queryCatalogDistress(q(`${seed[0]!.full_address}, Cincinnati`, -84.51, 39.11));
    expect(matches.some((m) => m.source.id === "cincinnati-code-enforcement")).toBe(true);
  }, 30000);

  it("Calgary assessments ground a real assessed value", async () => {
    const matches = await queryCatalogSales(q("15 Deermeade Pl SE, Calgary", -114.03, 50.93));
    expect(matches.some((m) => m.source.id === "calgary-assessments" && m.amount)).toBe(true);
  }, 20000);

  it("Winnipeg assessments ground a real assessed value", async () => {
    const matches = await queryCatalogSales(q("1636 McCreary Road, Winnipeg", -97.32, 49.83));
    expect(matches.some((m) => m.source.id === "winnipeg-assessments" && m.amount)).toBe(true);
  }, 20000);

  it("Vancouver property tax grounds a real assessed value", async () => {
    const matches = await queryCatalogSales(q("402 Alberta St, Vancouver", -123.114, 49.264));
    expect(matches.some((m) => m.source.id === "vancouver-property-tax" && m.amount)).toBe(true);
  }, 20000);

  it("HM Land Registry grounds a real price-paid record by postcode", async () => {
    // Fetch a live postcode's records straight from the API first so the
    // assertion tracks the dataset, not a hardcoded sale.
    const seed = (await (
      await fetch("https://landregistry.data.gov.uk/data/ppi/transaction-record.json?_pageSize=1", {
        headers: { "User-Agent": "Forleads/1.0 (live catalog check)", Accept: "application/json" },
      })
    ).json()) as {
      result?: {
        items?: {
          propertyAddress?: { paon?: string; street?: string; town?: string; postcode?: string };
        }[];
      };
    };
    const a = seed.result?.items?.[0]?.propertyAddress;
    expect(a?.postcode, "HMLR API no longer returns records").toBeTruthy();
    const address = [a!.paon, a!.street, a!.town, a!.postcode].filter(Boolean).join(" ");

    const matches = await queryCatalogSales(q(address, -0.12, 51.5));
    expect(matches.some((m) => m.source.id === "hmlr-price-paid" && m.amount?.startsWith("£"))).toBe(true);
  }, 30000);

  it("FEMA NFHL grounds a flood card for a Houston point", async () => {
    const cards = await new OpenRiskDataProvider([], []).hazards(q("Houston, TX", -95.36, 29.76));
    expect(cards[0]?.confidence).not.toBe("D");
    expect(cards[0]?.sources?.[0]?.name).toContain("FEMA");
  }, 20000);

  it("EA flood zones answer for a Thames-side London point", async () => {
    const cards = await new OpenRiskDataProvider([], []).hazards(q("London SE1", -0.118, 51.501));
    expect(cards[0]?.confidence).not.toBe("D");
    expect(cards[0]?.sources?.[0]?.name).toContain("EA Flood Zone");
  }, 20000);

  it("France DVF grounds a real mutation from the commune CSV", async () => {
    // Self-grounding: read the live commune file for Paris 1er, take a row
    // with an address, then prove the full pipeline finds it.
    const year = new Date().getFullYear() - 1;
    const res = await fetch(`https://files.data.gouv.fr/geo-dvf/latest/csv/${year}/communes/75/75101.csv`, {
      headers: { "User-Agent": "Forleads/1.0 (live catalog check)" },
      redirect: "follow",
    });
    expect(res.ok, "DVF commune CSV unreachable").toBe(true);
    const [header, ...lines] = (await res.text()).split(/\r?\n/).filter((l) => l.trim() !== "");
    const cols = header!.split(",");
    const iNum = cols.indexOf("adresse_numero");
    const iVoie = cols.indexOf("adresse_nom_voie");
    const iVal = cols.indexOf("valeur_fonciere");
    const seeded = lines
      .map((l) => l.split(","))
      .find((cells) => cells[iNum] && cells[iVoie] && cells[iVal]);
    expect(seeded, "no addressed mutation in DVF sample").toBeTruthy();
    const address = `${seeded![iNum]} ${seeded![iVoie]}, Paris`;

    const matches = await queryCatalogSales(q(address, 2.336, 48.863));
    expect(matches.some((m) => m.source.id === "france-dvf" && m.amount?.startsWith("€"))).toBe(true);
  }, 40000);
});

describe.runIf(!live)("catalog live verification (skipped)", () => {
  it("is opt-in via LIVE_CATALOG=1", () => {
    expect(live).toBe(false);
  });
});
