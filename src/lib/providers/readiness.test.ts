import { afterEach, describe, expect, it } from "vitest";
import { dataSourceReadiness } from "./readiness";

const watchedKeys = [
  "OPEN_SALES_DATA_URL",
  "OPEN_SALES_DATA_URLS",
  "HMLR_PRICE_PAID_URL",
  "COUNTY_OPEN_DATA_URL",
  "US_OPEN_SALES_DATA_URL",
  "UK_PRICE_PAID_DATA_URL",
  "ENGLAND_PRICE_PAID_DATA_URL",
  "EU_OPEN_SALES_DATA_URL",
  "EU_CADASTRE_DATA_URL",
  "AFRICA_OPEN_SALES_DATA_URL",
  "OPERATOR_SALES_IMPORT_URL",
  "TAX_DELINQUENCY_DATA_URL",
  "VACANT_REGISTRY_DATA_URL",
  "AFRICA_BUILDINGS_DATA_URL",
  "AFRICA_DISTRESS_DATA_URL",
  "AFRICA_HAZARD_LAYER_URL",
] as const;

const original = Object.fromEntries(watchedKeys.map((key) => [key, process.env[key]])) as Record<
  (typeof watchedKeys)[number],
  string | undefined
>;

afterEach(() => {
  for (const key of watchedKeys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

function clearWatchedEnv() {
  for (const key of watchedKeys) delete process.env[key];
}

describe("dataSourceReadiness", () => {
  it("shows open market data as setup-required until a public feed exists", () => {
    clearWatchedEnv();

    const sales = dataSourceReadiness().find((source) => source.id === "open-sales");

    expect(sales?.status).toBe("setup_required");
    expect(sales?.env).toContain("OPEN_SALES_DATA_URL");
  });

  it("marks open feeds live without exposing URLs as secrets", () => {
    clearWatchedEnv();
    process.env.OPEN_SALES_DATA_URL = "https://example.test/sales.csv";
    process.env.TAX_DELINQUENCY_DATA_URL = "https://example.test/tax.csv";

    const sources = dataSourceReadiness();
    const sales = sources.find((source) => source.id === "open-sales");
    const distress = sources.find((source) => source.id === "open-distress");

    expect(sales?.status).toBe("live");
    expect(sales?.detail).not.toContain("example.test");
    expect(distress?.status).toBe("live");
    expect(distress?.detail).not.toContain("example.test");
  });

  it("shows regional proof packs for America, England/Wales, Europe, and Africa", () => {
    clearWatchedEnv();
    process.env.HMLR_PRICE_PAID_URL = "https://example.test/hmlr.csv";
    process.env.EU_OPEN_SALES_DATA_URL = "https://example.test/eu-sales.csv";

    const sources = dataSourceReadiness();

    expect(sources.find((source) => source.id === "region-america")?.status).toBe("setup_required");
    expect(sources.find((source) => source.id === "region-england-wales")?.status).toBe("live");
    expect(sources.find((source) => source.id === "region-europe")?.status).toBe("live");
    expect(sources.find((source) => source.id === "region-africa")?.status).toBe("manual_capture");
  });
});
