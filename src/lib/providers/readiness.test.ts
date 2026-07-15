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
  "GOOGLE_MAPS_API_KEY",
  "MAPILLARY_TOKEN",
  "OPERATOR_PROPERTY_MEDIA_URL",
  "FIELD_PHOTO_MANIFEST_URL",
  "RESO_WEB_API_URL",
  "RESO_ACCESS_TOKEN",
  "MLS_GRID_URL",
  "MLS_GRID_ACCESS_TOKEN",
  "ATTOM_API_KEY",
  "RENTCAST_API_KEY",
  "REGRID_API_KEY",
  "REPORTALL_API_KEY",
  "OPEN_ADDRESSES_URL",
  "CENSUS_TIGER_LINE_URL",
  "COUNTY_RECORDER_DATA_URL",
  "PLANNING_GIS_URL",
  "MICROSOFT_BUILDING_FOOTPRINTS_URL",
  "GOOGLE_OPEN_BUILDINGS_URL",
  "LOCAL_BUILDINGS_GEOJSON_URL",
  "N8N_WEBHOOK_URL",
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
  it("shows open market data live out of the box via the built-in catalog", () => {
    clearWatchedEnv();

    const sales = dataSourceReadiness().find((source) => source.id === "open-sales");

    expect(sales?.status).toBe("live");
    expect(sales?.detail).toContain("Built in and verified");
    expect(sales?.env).toContain("OPEN_SALES_DATA_URL");
  });

  it("names Oklahoma County coverage without implying statewide parcel depth", () => {
    clearWatchedEnv();

    const usa = dataSourceReadiness().find((source) => source.id === "region-america");

    expect(usa?.detail).toContain("Oklahoma County, OK");
    expect(usa?.detail).not.toContain("Oklahoma statewide");
  });

  it("marks operator feeds as running alongside built-ins without exposing URLs", () => {
    clearWatchedEnv();
    process.env.OPEN_SALES_DATA_URL = "https://example.test/sales.csv";
    process.env.TAX_DELINQUENCY_DATA_URL = "https://example.test/tax.csv";

    const sources = dataSourceReadiness();
    const sales = sources.find((source) => source.id === "open-sales");
    const distress = sources.find((source) => source.id === "open-distress");

    expect(sales?.status).toBe("live");
    expect(sales?.detail).toContain("alongside the built-ins");
    expect(sales?.detail).not.toContain("example.test");
    expect(distress?.status).toBe("live");
    expect(distress?.detail).not.toContain("example.test");
  });

  it("shows at least twenty legitimate source lanes without fake-live imagery", () => {
    clearWatchedEnv();
    process.env.HMLR_PRICE_PAID_URL = "https://example.test/hmlr.csv";

    const sources = dataSourceReadiness();

    expect(sources.length).toBeGreaterThanOrEqual(20);
    expect(sources.find((source) => source.id === "hmlr-price-paid")?.status).toBe("live");
    expect(sources.find((source) => source.id === "google-street-view")?.status).toBe("setup_required");
    expect(sources.find((source) => source.id === "mapillary")?.status).toBe("setup_required");
    expect(sources.find((source) => source.id === "field-photos")?.status).toBe("manual_capture");
    expect(sources.map((source) => source.id)).toEqual(
      expect.arrayContaining(["reso-web-api", "mls-grid", "attom", "regrid", "reportall"]),
    );
  });

  it("marks operator-owned property photos live only when a media manifest is configured", () => {
    clearWatchedEnv();

    const missing = dataSourceReadiness().find((source) => source.id === "field-photos");
    expect(missing?.status).toBe("manual_capture");

    process.env.OPERATOR_PROPERTY_MEDIA_URL = "https://broker.example/media-manifest.json";
    const configured = dataSourceReadiness().find((source) => source.id === "field-photos");

    expect(configured?.status).toBe("live");
    expect(configured?.detail).toContain("manifest row matches");
    expect(configured?.env).toEqual(
      expect.arrayContaining(["OPERATOR_PROPERTY_MEDIA_URL", "FIELD_PHOTO_MANIFEST_URL"]),
    );
  });

  it("shows regional packs live by default and Africa honestly field-first", () => {
    clearWatchedEnv();

    const sources = dataSourceReadiness();

    expect(sources.find((source) => source.id === "region-america")?.status).toBe("live");
    expect(sources.find((source) => source.id === "region-america")?.detail).toContain("New York City");
    expect(sources.find((source) => source.id === "region-canada")?.status).toBe("live");
    expect(sources.find((source) => source.id === "region-canada")?.detail).toContain("Calgary");
    expect(sources.find((source) => source.id === "region-europe")?.status).toBe("live");
    expect(sources.find((source) => source.id === "region-europe")?.detail).toContain("England & Wales");
    expect(sources.find((source) => source.id === "region-africa")?.status).toBe("manual_capture");
  });

  it("keeps licensed adapters planned even when every credential is present", () => {
    clearWatchedEnv();
    process.env.RESO_WEB_API_URL = "https://reso.example.test";
    process.env.MLS_GRID_ACCESS_TOKEN = "token";

    const sources = dataSourceReadiness();

    expect(sources.find((source) => source.id === "reso-web-api")?.status).toBe("planned");
    expect(sources.find((source) => source.id === "mls-grid")?.status).toBe("planned");

    process.env.RESO_ACCESS_TOKEN = "token";
    process.env.MLS_GRID_URL = "https://mls-grid.example.test";

    const configuredSources = dataSourceReadiness();
    expect(configuredSources.find((source) => source.id === "reso-web-api")?.status).toBe("planned");
    expect(configuredSources.find((source) => source.id === "reso-web-api")?.detail).toContain("Credentials are present");
    expect(configuredSources.find((source) => source.id === "mls-grid")?.status).toBe("planned");
  });

  it("never treats unused env switches as implemented capabilities", () => {
    clearWatchedEnv();
    process.env.OPEN_ADDRESSES_URL = "https://example.test/addresses";
    process.env.CENSUS_TIGER_LINE_URL = "https://example.test/tiger";
    process.env.COUNTY_RECORDER_DATA_URL = "https://example.test/deeds";
    process.env.PLANNING_GIS_URL = "https://example.test/planning";
    process.env.MICROSOFT_BUILDING_FOOTPRINTS_URL = "https://example.test/buildings";
    process.env.N8N_WEBHOOK_URL = "https://example.test/n8n";

    const sources = dataSourceReadiness();
    for (const id of [
      "openaddresses",
      "census-tiger",
      "county-recorder",
      "planning-zoning",
      "microsoft-buildings",
    ]) {
      expect(sources.find((source) => source.id === id)?.status).toBe("planned");
    }
    expect(sources.find((source) => source.id === "automation")?.status).toBe("setup_required");
    expect(sources.find((source) => source.id === "automation")?.detail).toContain(
      "N8N_WEBHOOK_URL alone is not wired",
    );
  });

  it("reports built-in FEMA coverage live without requiring a duplicate env override", () => {
    clearWatchedEnv();

    const fema = dataSourceReadiness().find((source) => source.id === "fema-nfhl");

    expect(fema?.status).toBe("live");
    expect(fema?.detail).toContain("Built in");
  });
});
