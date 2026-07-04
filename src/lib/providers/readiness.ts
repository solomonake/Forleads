import { config } from "@/lib/core/config";

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
          ? "Set FORLEADS_GEOCODER=nominatim for solo testing or photon-nominatim for self-hosted scale."
          : `Live via ${config.geocoder}.`,
      env: ["FORLEADS_GEOCODER", "NOMINATIM_URL", "PHOTON_URL", "OPEN_ADDRESSES_URL", "CENSUS_TIGER_LINE_URL"],
    },
    {
      id: "osm",
      label: "OpenStreetMap building facts",
      status: config.propertyProvider === "osm" ? "live" : "setup_required",
      unlocks: "Land use, building tags, address context, and the global free evidence floor.",
      configuredBy: ["OpenStreetMap", "Overpass", "self-hosted OSM extracts"],
      detail:
        config.propertyProvider === "osm"
          ? "Live global floor. It is excellent for presence/context, but not owner or sale-price truth."
          : "Set FORLEADS_PROPERTY_PROVIDER=osm for the open public-record floor.",
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
        : "Add an open building-footprint dataset URL or ETL output before grading footprint/size above D.",
      env: ["MICROSOFT_BUILDING_FOOTPRINTS_URL", "GOOGLE_OPEN_BUILDINGS_URL", "LOCAL_BUILDINGS_GEOJSON_URL", "AFRICA_BUILDINGS_DATA_URL"],
    }),
    openSource({
      id: "open-sales",
      label: "Open sale and valuation records",
      live: openSalesLive,
      unlocks: "Last sale, price-paid, public comps, and transparent valuation context where open data exists.",
      configuredBy: ["HM Land Registry Price Paid", "county open-data portals", "local assessor CSV exports"],
      detail: openSalesLive
        ? "At least one open sale/assessor source is configured."
        : "Add a global, regional, or operator-imported public feed before upgrading ARV/comps.",
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
      live: openDistressLive,
      unlocks: "Tax delinquency, code violations, vacant registry, nuisance, or foreclosure notices where public.",
      configuredBy: ["county/city open data", "public tax delinquency CSVs", "court notice feeds"],
      detail: openDistressLive
        ? "At least one open distress source is configured."
        : "Add open county/city data feeds before promoting distress flags above D.",
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
      live: openHazardLive,
      unlocks: "Flood, hazard, and environmental risk cards with cited public sources.",
      configuredBy: ["FEMA NFHL", "local hazard GIS", "open environmental layers"],
      detail: openHazardLive
        ? "Open hazard source configured."
        : "Add FEMA_NFHL_URL or OPEN_HAZARD_LAYER_URL before grading hazard risk above D.",
      env: ["FEMA_NFHL_URL", "OPEN_HAZARD_LAYER_URL", "US_HAZARD_LAYER_URL", "UK_HAZARD_LAYER_URL", "EU_HAZARD_LAYER_URL", "AFRICA_HAZARD_LAYER_URL"],
    }),
    openSource({
      id: "region-america",
      label: "America / US public-record pack",
      live: americaLive,
      unlocks: "County sales/assessor CSVs, FEMA NFHL, code violations, tax delinquency, and vacant registries.",
      configuredBy: ["county open data", "Socrata", "FEMA NFHL", "operator CSV imports"],
      detail: americaLive
        ? "At least one America/US open source is configured."
        : "Start with county/Socrata feeds plus FEMA_NFHL_URL. Use OPERATOR_SALES_IMPORT_URL when the county only exports CSV.",
      env: ["US_OPEN_SALES_DATA_URL", "COUNTY_OPEN_DATA_URL", "FEMA_NFHL_URL", "US_DISTRESS_DATA_URL", "OPERATOR_SALES_IMPORT_URL"],
    }),
    openSource({
      id: "region-england-wales",
      label: "England / Wales price-paid pack",
      live: englandLive,
      unlocks: "HM Land Registry Price Paid rows, planning/open council feeds, flood layers, and operator imports.",
      configuredBy: ["HM Land Registry Price Paid Data", "data.gov.uk", "local council open data"],
      detail: englandLive
        ? "England/Wales price-paid source configured."
        : "Add HMLR_PRICE_PAID_URL or UK_PRICE_PAID_DATA_URL. No-header HMLR CSV rows are supported.",
      env: ["HMLR_PRICE_PAID_URL", "UK_PRICE_PAID_DATA_URL", "ENGLAND_PRICE_PAID_DATA_URL", "UK_HAZARD_LAYER_URL", "UK_DISTRESS_DATA_URL"],
    }),
    openSource({
      id: "region-europe",
      label: "Europe open-data pack",
      live: europeLive,
      unlocks: "Per-country cadastral/open-sales feeds, INSPIRE-style hazard layers, and municipal distress datasets.",
      configuredBy: ["data.europa.eu discovery", "national cadastral portals", "municipal open data"],
      detail: europeLive
        ? "At least one Europe open-data source is configured."
        : "Configure per-country EU_OPEN_SALES_DATA_URL, EU_CADASTRE_DATA_URL, EU_HAZARD_LAYER_URL, or EU_DISTRESS_DATA_URL.",
      env: ["EU_OPEN_SALES_DATA_URL", "EU_CADASTRE_DATA_URL", "EU_HAZARD_LAYER_URL", "EU_DISTRESS_DATA_URL"],
    }),
    {
      id: "region-africa",
      label: "Africa field-first open-data pack",
      status: africaLive ? "live" : "manual_capture",
      unlocks: "Google/Microsoft open buildings, local open GIS where available, field-scout notes/photos, and operator imports.",
      configuredBy: ["Google Open Buildings", "Microsoft Building Footprints", "local open data", "field capture"],
      detail: africaLive
        ? "At least one Africa open source is configured."
        : "Formal sale/distress feeds are uneven by market. Use open buildings plus field capture and operator CSV imports first.",
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
