import { config } from "@/lib/core/config";
import { OPEN_DATA_CATALOG } from "@/lib/providers/catalog";

function builtinMarkets(...kinds: string[]): string[] {
  const markets: string[] = [];
  for (const source of OPEN_DATA_CATALOG) {
    if (kinds.includes(source.kind) && !markets.includes(source.market)) markets.push(source.market);
  }
  return markets;
}

function builtinRegionMarkets(region: string): string[] {
  const markets: string[] = [];
  for (const source of OPEN_DATA_CATALOG) {
    if (source.region === region && !markets.includes(source.market)) markets.push(source.market);
  }
  return markets;
}

function builtinDetail(markets: string[]): string {
  return `Built in and verified: ${markets.join(", ")}. Add your county/city feed via env to extend coverage.`;
}

export type ReadinessStatus = "live" | "setup_required" | "manual_capture" | "planned";

export interface DataSourceReadiness {
  id: string;
  label: string;
  status: ReadinessStatus;
  unlocks: string;
  configuredBy: string[];
  detail: string;
  env: string[];
}

function has(key: string): boolean {
  const value = process.env[key];
  return Boolean(value && value.trim() !== "");
}

function configured(...keys: string[]): boolean {
  return keys.some(has);
}

function openSource(input: Omit<DataSourceReadiness, "status"> & { live: boolean }): DataSourceReadiness {
  return {
    id: input.id,
    label: input.label,
    status: input.live ? "live" : "setup_required",
    unlocks: input.unlocks,
    configuredBy: input.configuredBy,
    detail: input.detail,
    env: input.env,
  };
}

export function dataSourceReadiness(): DataSourceReadiness[] {
  const openSalesLive = configured(
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
  );
  const openDistressLive = configured(
    "OPEN_DISTRESS_DATA_URL",
    "OPEN_DISTRESS_DATA_URLS",
    "TAX_DELINQUENCY_DATA_URL",
    "CODE_VIOLATION_DATA_URL",
    "VACANT_REGISTRY_DATA_URL",
    "US_DISTRESS_DATA_URL",
    "UK_DISTRESS_DATA_URL",
    "EU_DISTRESS_DATA_URL",
    "AFRICA_DISTRESS_DATA_URL",
  );
  const openHazardLive = configured(
    "FEMA_NFHL_URL",
    "OPEN_HAZARD_LAYER_URL",
    "US_HAZARD_LAYER_URL",
    "UK_HAZARD_LAYER_URL",
    "EU_HAZARD_LAYER_URL",
    "AFRICA_HAZARD_LAYER_URL",
  );
  const openBuildingsLive = configured(
    "MICROSOFT_BUILDING_FOOTPRINTS_URL",
    "GOOGLE_OPEN_BUILDINGS_URL",
    "LOCAL_BUILDINGS_GEOJSON_URL",
    "AFRICA_BUILDINGS_DATA_URL",
  );
  const openMailLive = configured("N8N_WEBHOOK_URL", "ZAPIER_WEBHOOK_URL");
  const americaLive = configured("US_OPEN_SALES_DATA_URL", "COUNTY_OPEN_DATA_URL", "FEMA_NFHL_URL", "US_DISTRESS_DATA_URL");
  const englandLive = configured("HMLR_PRICE_PAID_URL", "UK_PRICE_PAID_DATA_URL", "ENGLAND_PRICE_PAID_DATA_URL");
  const europeLive = configured("EU_OPEN_SALES_DATA_URL", "EU_CADASTRE_DATA_URL", "EU_HAZARD_LAYER_URL", "EU_DISTRESS_DATA_URL");
  const africaLive = configured("AFRICA_OPEN_SALES_DATA_URL", "AFRICA_DISTRESS_DATA_URL", "AFRICA_HAZARD_LAYER_URL", "AFRICA_BUILDINGS_DATA_URL");

  return [
    {
      id: "geocode",
      label: "Open address search",
      status: config.geocoder === "mock" ? "setup_required" : "live",
      unlocks: "Find and ground addresses without buying a geocoding vendor.",
      configuredBy: ["Nominatim", "Photon", "OpenAddresses", "Census TIGER/Line", "self-hosted OSM extracts"],
      detail:
        config.geocoder === "mock"
          ? "Address search is being prepared for this workspace."
          : `Live via ${config.geocoder}.`,
      env: ["FORLEADS_GEOCODER", "NOMINATIM_URL", "PHOTON_URL", "OPEN_ADDRESSES_URL", "CENSUS_TIGER_LINE_URL"],
    },
    {
      id: "osm",
      label: "OpenStreetMap building facts",
      // "open-data" wraps the OSM floor, so OSM facts are live in both modes.
      status: config.propertyProvider === "osm" || config.propertyProvider === "open-data" ? "live" : "setup_required",
      unlocks: "Land use, building tags, address context, and the global free evidence floor.",
      configuredBy: ["OpenStreetMap", "Overpass", "self-hosted OSM extracts"],
      detail:
        config.propertyProvider === "osm" || config.propertyProvider === "open-data"
          ? "Live global floor. It is excellent for presence/context, but not owner or sale-price truth."
          : "Public building facts are being prepared for this workspace.",
      env: ["FORLEADS_PROPERTY_PROVIDER", "OVERPASS_URL"],
    },
    {
      id: "field-scout",
      label: "Field-scout evidence",
      status: "live",
      unlocks: "Operator notes such as tall grass, boarded windows, vacancy signs, repairs, or owner intent.",
      configuredBy: ["Forleads notes", "future photo/GPS capture"],
      detail:
        "Live today through field notes. Photo upload, GPS route coverage, and offline queue are next build slices.",
      env: ["FIELD_PHOTO_STORAGE", "NEXT_PUBLIC_ENABLE_ROUTE_TRACKING"],
    },
    openSource({
      id: "open-buildings",
      label: "Open building footprints",
      live: openBuildingsLive,
      unlocks: "Footprints, approximate structure size, and coverage where OSM tags are sparse.",
      configuredBy: ["Microsoft Building Footprints", "Google Open Buildings", "local open GIS"],
      detail: openBuildingsLive
        ? "Open building footprint source configured."
        : "Building footprints aren't available in this market yet — coverage grows as public datasets land.",
      env: ["MICROSOFT_BUILDING_FOOTPRINTS_URL", "GOOGLE_OPEN_BUILDINGS_URL", "LOCAL_BUILDINGS_GEOJSON_URL", "AFRICA_BUILDINGS_DATA_URL"],
    }),
    openSource({
      id: "open-sales",
      label: "Open sale and valuation records",
      live: true,
      unlocks: "Last sale, price-paid, public comps, and transparent valuation context where open data exists.",
      configuredBy: ["HM Land Registry Price Paid", "France DVF", "city open-data portals", "local assessor CSV exports"],
      detail: openSalesLive
        ? `Your configured feed runs alongside the built-ins (${builtinMarkets("sales", "assessment").join(", ")}).`
        : builtinDetail(builtinMarkets("sales", "assessment")),
      env: [
        "OPEN_SALES_DATA_URL",
        "OPEN_SALES_DATA_URLS",
        "HMLR_PRICE_PAID_URL",
        "COUNTY_OPEN_DATA_URL",
        "US_OPEN_SALES_DATA_URL",
        "UK_PRICE_PAID_DATA_URL",
        "EU_OPEN_SALES_DATA_URL",
        "AFRICA_OPEN_SALES_DATA_URL",
        "OPERATOR_SALES_IMPORT_URL",
      ],
    }),
    openSource({
      id: "open-distress",
      label: "Open distress signals",
      live: true,
      unlocks: "Tax delinquency, code violations, vacant registry, nuisance, or foreclosure notices where public.",
      configuredBy: ["county/city open data", "public tax delinquency CSVs", "court notice feeds"],
      detail: openDistressLive
        ? `Your configured feed runs alongside the built-ins (${builtinMarkets("distress").join(", ")}).`
        : builtinDetail(builtinMarkets("distress")),
      env: [
        "OPEN_DISTRESS_DATA_URL",
        "OPEN_DISTRESS_DATA_URLS",
        "TAX_DELINQUENCY_DATA_URL",
        "CODE_VIOLATION_DATA_URL",
        "VACANT_REGISTRY_DATA_URL",
        "US_DISTRESS_DATA_URL",
        "UK_DISTRESS_DATA_URL",
        "EU_DISTRESS_DATA_URL",
        "AFRICA_DISTRESS_DATA_URL",
      ],
    }),
    openSource({
      id: "open-hazard",
      label: "Open hazard and flood layers",
      live: true,
      unlocks: "Flood, hazard, and environmental risk cards with cited public sources.",
      configuredBy: ["FEMA NFHL", "EA Flood Map for Planning", "local hazard GIS"],
      detail: openHazardLive
        ? `Your configured layer runs alongside the built-ins (${builtinMarkets("hazard").join(", ")}).`
        : builtinDetail(builtinMarkets("hazard")),
      env: ["FEMA_NFHL_URL", "OPEN_HAZARD_LAYER_URL", "US_HAZARD_LAYER_URL", "UK_HAZARD_LAYER_URL", "EU_HAZARD_LAYER_URL", "AFRICA_HAZARD_LAYER_URL"],
    }),
    openSource({
      id: "region-america",
      label: "USA public-record pack",
      live: true,
      unlocks: "City sale records, code violations, and FEMA national flood zones — plus county feeds you add.",
      configuredBy: ["built-in verified catalog", "county open data", "Socrata", "operator CSV imports"],
      detail: americaLive
        ? `Your configured feed runs alongside the built-ins (${builtinRegionMarkets("usa").join(", ")}).`
        : builtinDetail(builtinRegionMarkets("usa")),
      env: ["US_OPEN_SALES_DATA_URL", "COUNTY_OPEN_DATA_URL", "FEMA_NFHL_URL", "US_DISTRESS_DATA_URL", "OPERATOR_SALES_IMPORT_URL"],
    }),
    openSource({
      id: "region-canada",
      label: "Canada assessment pack",
      live: true,
      unlocks: "Official assessed values and year-built context from city assessment registers.",
      configuredBy: ["built-in verified catalog", "provincial/municipal open data", "operator CSV imports"],
      detail: builtinDetail(builtinRegionMarkets("canada")),
      env: ["OPEN_SALES_DATA_URLS", "OPEN_DISTRESS_DATA_URLS", "OPEN_HAZARD_LAYER_URL"],
    }),
    openSource({
      id: "region-europe",
      label: "Europe open-data pack",
      live: true,
      unlocks: "HM Land Registry price-paid (England & Wales), France DVF sales, and EA flood zones — plus national feeds you add.",
      configuredBy: ["built-in verified catalog", "data.europa.eu discovery", "national cadastral portals"],
      detail: europeLive || englandLive
        ? `Your configured feed runs alongside the built-ins (${builtinRegionMarkets("europe").join(", ")}).`
        : builtinDetail(builtinRegionMarkets("europe")),
      env: ["HMLR_PRICE_PAID_URL", "EU_OPEN_SALES_DATA_URL", "EU_CADASTRE_DATA_URL", "EU_HAZARD_LAYER_URL", "EU_DISTRESS_DATA_URL"],
    }),
    {
      id: "region-africa",
      label: "Africa field-first open-data pack",
      status: africaLive ? "live" : "manual_capture",
      unlocks: "OSM buildings (built in, global), field-scout notes/photos, and operator imports.",
      configuredBy: ["OpenStreetMap", "field capture", "operator imports", "local open data"],
      detail: africaLive
        ? "At least one Africa open source is configured."
        : "No free valuation registry passed our live verification yet (Cape Town's open service was down when checked). OSM buildings work everywhere; field capture and your own imports carry the most weight here.",
      env: ["AFRICA_BUILDINGS_DATA_URL", "AFRICA_OPEN_SALES_DATA_URL", "AFRICA_DISTRESS_DATA_URL", "AFRICA_HAZARD_LAYER_URL", "GOOGLE_OPEN_BUILDINGS_URL"],
    },
    {
      id: "consented-contact",
      label: "Consented and operator-owned contacts",
      status: "live",
      unlocks: "Use Google profile/session, field notes, imported CRM contacts, and manually captured contact info.",
      configuredBy: ["Google OAuth", "operator input", "CRM imports"],
      detail:
        "Free-first contact enrichment means consented or operator-owned data. Global free skip tracing is not a lawful assumption.",
      env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "FOLLOWUPBOSS_API_KEY", "GHL_API_KEY"],
    },
    openSource({
      id: "open-automation",
      label: "Open automation bridge",
      live: openMailLive,
      unlocks: "Queue approved postcards, dialer tasks, or external jobs through self-hosted n8n/webhooks.",
      configuredBy: ["n8n", "webhook receiver", "Zapier-compatible endpoint"],
      detail: openMailLive
        ? "Automation bridge configured."
        : "Use N8N_WEBHOOK_URL or a webhook receiver for free/self-hosted outbound job queues.",
      env: ["N8N_WEBHOOK_URL", "ZAPIER_WEBHOOK_URL"],
    }),
  ];
}
