// ============================================================================
// LIVE catalog verification — opt-in (LIVE_CATALOG=1), hits the real public
// endpoints. Run this when touching the catalog or on a schedule to catch
// source rot: a dead feed should fail HERE, not silently degrade production.
//   LIVE_CATALOG=1 npx vitest run src/lib/providers/catalog.live.test.ts
// ============================================================================

import { describe, expect, it } from "vitest";
import type { PropertyQuery } from "./types";
import { queryCatalogDistress, queryCatalogSales } from "./catalog";
import { OpenRiskDataProvider } from "./real";

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
