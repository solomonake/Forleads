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

function configuredAll(...keys: string[]): boolean {
  return keys.every(has);
}

function source(input: Omit<DataSourceReadiness, "status"> & { live: boolean; planned?: boolean }): DataSourceReadiness {
  return {
    id: input.id,
    label: input.label,
    status: input.live ? "live" : input.planned ? "planned" : "setup_required",
    unlocks: input.unlocks,
    configuredBy: input.configuredBy,
    detail: input.detail,
    env: input.env,
  };
}

function plannedAdapter(input: Omit<DataSourceReadiness, "status" | "detail"> & {
  configured: boolean;
  detail: string;
}): DataSourceReadiness {
  const { configured: isConfigured, ...rest } = input;
  return {
    ...rest,
    status: "planned",
    detail: isConfigured
      ? `${input.detail} Credentials are present, but Forleads has not implemented and capability-verified this adapter yet. Do not purchase or rely on this source until the card becomes available to connect.`
      : `${input.detail} This adapter is not implemented yet. A key alone will not unlock it, so do not purchase access for Forleads yet.`,
  };
}

export function dataSourceReadiness(): DataSourceReadiness[] {
  const nominatimLive = config.geocoder === "nominatim" || config.geocoder === "photon-nominatim";
  const photonLive = config.geocoder === "photon-nominatim";
  const mapillaryLive = config.imageryProvider === "mapillary" && configured("MAPILLARY_TOKEN");
  const googleStreetViewLive =
    config.imageryProvider === "google-street-view" && configured("GOOGLE_MAPS_API_KEY");
  const fieldPhotoLive = configured(
    "OPERATOR_PROPERTY_MEDIA_URL",
    "FIELD_PHOTO_MANIFEST_URL",
    "FIELD_PHOTO_STORAGE",
    "NEXT_PUBLIC_FIELD_PHOTOS",
  );
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
  const africaLive = configured(
    "AFRICA_BUILDINGS_DATA_URL",
    "AFRICA_OPEN_SALES_DATA_URL",
    "AFRICA_DISTRESS_DATA_URL",
    "AFRICA_HAZARD_LAYER_URL",
  );
  const hazardLive = configured(
    "FEMA_NFHL_URL",
    "OPEN_HAZARD_LAYER_URL",
    "US_HAZARD_LAYER_URL",
    "UK_HAZARD_LAYER_URL",
    "EU_HAZARD_LAYER_URL",
    "AFRICA_HAZARD_LAYER_URL",
  );
  const buildingsLive = configured(
    "MICROSOFT_BUILDING_FOOTPRINTS_URL",
    "GOOGLE_OPEN_BUILDINGS_URL",
    "LOCAL_BUILDINGS_GEOJSON_URL",
    "AFRICA_BUILDINGS_DATA_URL",
  );
  const automationLive = configured("ZAPIER_WEBHOOK_URL");

  return [
    source({
      id: "osm-overpass",
      label: "OpenStreetMap / Overpass",
      live: config.propertyProvider === "osm" || config.propertyProvider === "open-data",
      unlocks: "Building tags, land use, address context, and the global free map floor.",
      configuredBy: ["OpenStreetMap", "Overpass", "self-hosted OSM extracts"],
      detail: "Live global floor when OSM/open-data is selected. Great for map/building context, not owner, MLS, or sale-price truth.",
      env: ["FORLEADS_PROPERTY_PROVIDER", "OVERPASS_URL"],
    }),
    source({
      id: "nominatim",
      label: "Nominatim geocoding",
      live: nominatimLive,
      unlocks: "Address search and reverse geocoding with OSM attribution and strict fair-use limits.",
      configuredBy: ["Public Nominatim", "self-hosted Nominatim"],
      detail: nominatimLive ? `Live via ${config.geocoder}.` : "Configure Nominatim or a self-hosted endpoint before relying on address search.",
      env: ["FORLEADS_GEOCODER", "NOMINATIM_URL"],
    }),
    source({
      id: "photon",
      label: "Photon autocomplete",
      live: photonLive,
      unlocks: "Fast search-as-you-type when backed by a self-hosted Photon index.",
      configuredBy: ["Photon", "self-hosted OSM extracts"],
      detail: photonLive ? "Photon is configured for autocomplete." : "Planned for self-hosted autocomplete; public Nominatim must not be used as client autocomplete.",
      env: ["FORLEADS_GEOCODER", "PHOTON_URL"],
    }),
    source({
      id: "openaddresses",
      label: "OpenAddresses",
      live: false,
      planned: true,
      unlocks: "Structured open address points where country/region coverage exists.",
      configuredBy: ["OpenAddresses extract", "operator-hosted mirror"],
      detail: "Planned adapter. OPEN_ADDRESSES_URL is not consumed by the current geocoder or property pipeline.",
      env: ["OPEN_ADDRESSES_URL"],
    }),
    source({
      id: "census-tiger",
      label: "US Census TIGER/Line",
      live: false,
      planned: true,
      unlocks: "US streets, boundaries, and geographic context for routing and market areas.",
      configuredBy: ["US Census TIGER/Line"],
      detail: "Planned adapter. CENSUS_TIGER_LINE_URL is not consumed by the current geography pipeline.",
      env: ["CENSUS_TIGER_LINE_URL"],
    }),
    source({
      id: "mapillary",
      label: "Mapillary street imagery",
      live: mapillaryLive,
      unlocks: "Real street-level images where community coverage exists, with CC-BY-SA attribution.",
      configuredBy: ["Mapillary API"],
      detail: mapillaryLive ? "Mapillary is configured." : "Add MAPILLARY_TOKEN. Where coverage is missing, Forleads shows a gap.",
      env: ["FORLEADS_IMAGERY_PROVIDER", "MAPILLARY_TOKEN"],
    }),
    source({
      id: "google-street-view",
      label: "Google Street View",
      live: googleStreetViewLive,
      unlocks: "Real Street View images when a licensed Google Maps key and billing are enabled.",
      configuredBy: ["Google Street View Static API"],
      detail: googleStreetViewLive ? "Google Street View is configured through the server-side proxy." : "Requires GOOGLE_MAPS_API_KEY and billing; never expose the key or show placeholder images as proof.",
      env: ["FORLEADS_IMAGERY_PROVIDER", "GOOGLE_MAPS_API_KEY"],
    }),
    {
      id: "field-photos",
      label: "Agent-captured field photos",
      status: fieldPhotoLive ? "live" : "manual_capture",
      unlocks: "Current, first-party property photos captured during door knocking or field routes.",
      configuredBy: ["Forleads mobile capture", "operator media manifest", "storage bucket"],
      detail: fieldPhotoLive
        ? "Operator-owned media can render as real image evidence when a manifest row matches the selected property."
        : "Most trustworthy for current condition, but needs a media manifest or upload/storage wiring.",
      env: ["OPERATOR_PROPERTY_MEDIA_URL", "FIELD_PHOTO_MANIFEST_URL", "FIELD_PHOTO_STORAGE", "NEXT_PUBLIC_FIELD_PHOTOS"],
    },
    source({
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
    source({
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
    source({
      id: "open-hazard",
      label: "Open hazard and flood layers",
      live: true,
      unlocks: "Flood, hazard, and environmental risk cards with cited public sources.",
      configuredBy: ["FEMA NFHL", "EA Flood Map for Planning", "local hazard GIS"],
      detail: hazardLive
        ? `Your configured layer runs alongside the built-ins (${builtinMarkets("hazard").join(", ")}).`
        : builtinDetail(builtinMarkets("hazard")),
      env: ["FEMA_NFHL_URL", "OPEN_HAZARD_LAYER_URL", "US_HAZARD_LAYER_URL", "UK_HAZARD_LAYER_URL", "EU_HAZARD_LAYER_URL", "AFRICA_HAZARD_LAYER_URL"],
    }),
    source({
      id: "region-america",
      label: "USA public-record pack",
      live: true,
      unlocks: "City sale records, code violations, and FEMA national flood zones — plus county feeds you add.",
      configuredBy: ["built-in verified catalog", "county open data", "Socrata", "operator CSV imports"],
      detail: configured("US_OPEN_SALES_DATA_URL", "COUNTY_OPEN_DATA_URL", "FEMA_NFHL_URL", "US_DISTRESS_DATA_URL")
        ? `Your configured feed runs alongside the built-ins (${builtinRegionMarkets("usa").join(", ")}).`
        : builtinDetail(builtinRegionMarkets("usa")),
      env: ["US_OPEN_SALES_DATA_URL", "COUNTY_OPEN_DATA_URL", "FEMA_NFHL_URL", "US_DISTRESS_DATA_URL", "OPERATOR_SALES_IMPORT_URL"],
    }),
    source({
      id: "region-canada",
      label: "Canada assessment pack",
      live: true,
      unlocks: "Official assessed values and year-built context from city assessment registers.",
      configuredBy: ["built-in verified catalog", "provincial/municipal open data", "operator CSV imports"],
      detail: builtinDetail(builtinRegionMarkets("canada")),
      env: ["OPEN_SALES_DATA_URLS", "OPEN_DISTRESS_DATA_URLS", "OPEN_HAZARD_LAYER_URL"],
    }),
    source({
      id: "region-europe",
      label: "Europe open-data pack",
      live: true,
      unlocks: "HM Land Registry price-paid (England & Wales), France DVF sales, and EA flood zones — plus national feeds you add.",
      configuredBy: ["built-in verified catalog", "data.europa.eu discovery", "national cadastral portals"],
      detail: configured("HMLR_PRICE_PAID_URL", "UK_PRICE_PAID_DATA_URL", "ENGLAND_PRICE_PAID_DATA_URL", "EU_OPEN_SALES_DATA_URL", "EU_CADASTRE_DATA_URL", "EU_HAZARD_LAYER_URL", "EU_DISTRESS_DATA_URL")
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
    plannedAdapter({
      id: "reso-web-api",
      label: "RESO Web API / MLS",
      configured: configuredAll("RESO_WEB_API_URL", "RESO_ACCESS_TOKEN"),
      unlocks: "Authorized listing facts, status, media, broker fields, and standardized property resources.",
      configuredBy: ["RESO Web API", "broker/MLS agreement"],
      detail: "Requires broker/MLS authorization and licensed media rights.",
      env: ["RESO_WEB_API_URL", "RESO_ACCESS_TOKEN"],
    }),
    plannedAdapter({
      id: "mls-grid",
      label: "MLS Grid",
      configured: configuredAll("MLS_GRID_URL", "MLS_GRID_ACCESS_TOKEN"),
      unlocks: "Authorized MLS listing and media feed in participating markets.",
      configuredBy: ["MLS Grid license", "broker/MLS approval"],
      detail: "Requires an MLS Grid agreement; Forleads will never scrape MLS photos.",
      env: ["MLS_GRID_URL", "MLS_GRID_ACCESS_TOKEN"],
    }),
    plannedAdapter({
      id: "attom",
      label: "ATTOM property data",
      configured: configured("ATTOM_API_KEY"),
      unlocks: "US parcel, assessor, deed, mortgage, valuation, and property characteristics where licensed.",
      configuredBy: ["ATTOM Property Data API"],
      detail: "Paid/licensed source that must preserve ATTOM provenance and cache within license terms.",
      env: ["ATTOM_API_KEY"],
    }),
    plannedAdapter({
      id: "rentcast",
      label: "RentCast",
      configured: configured("RENTCAST_API_KEY"),
      unlocks: "Rental estimates, sale comps, market rent context, and property data where covered.",
      configuredBy: ["RentCast API"],
      detail: "Estimates must remain distinct from recorded sale facts.",
      env: ["RENTCAST_API_KEY"],
    }),
    plannedAdapter({
      id: "regrid",
      label: "Regrid parcels",
      configured: configured("REGRID_API_KEY"),
      unlocks: "Parcel boundaries, property records, zoning, and building data where licensed.",
      configuredBy: ["Regrid API"],
      detail: "Candidate national parcel source after terms, cache, cost, and field mapping are implemented.",
      env: ["REGRID_API_KEY"],
    }),
    plannedAdapter({
      id: "reportall",
      label: "ReportAll parcels",
      configured: configured("REPORTALL_API_KEY"),
      unlocks: "Parcel boundaries, owner/assessor fields, and county property attributes where licensed.",
      configuredBy: ["ReportAll API"],
      detail: "Owner fields must never be treated as outreach consent.",
      env: ["REPORTALL_API_KEY"],
    }),
    source({
      id: "hmlr-price-paid",
      label: "HM Land Registry Price Paid",
      live: configured("HMLR_PRICE_PAID_URL", "UK_PRICE_PAID_DATA_URL", "ENGLAND_PRICE_PAID_DATA_URL"),
      unlocks: "Recorded sale prices for England and Wales.",
      configuredBy: ["HM Land Registry Price Paid Data"],
      detail: "Official price-paid rows; still match addresses carefully and show as-of dates.",
      env: ["HMLR_PRICE_PAID_URL", "UK_PRICE_PAID_DATA_URL", "ENGLAND_PRICE_PAID_DATA_URL"],
    }),
    source({
      id: "county-assessor",
      label: "County assessor feeds",
      live: configured("COUNTY_ASSESSOR_DATA_URL", "COUNTY_OPEN_DATA_URL", "US_OPEN_SALES_DATA_URL"),
      unlocks: "Assessed value, year built, building area, land area, use code, and owner/tax fields where public.",
      configuredBy: ["county assessor", "county open data", "operator import"],
      detail: "County-by-county source; do not generalize one county's schema to another without mapping.",
      env: ["COUNTY_ASSESSOR_DATA_URL", "COUNTY_OPEN_DATA_URL", "US_OPEN_SALES_DATA_URL"],
    }),
    source({
      id: "county-recorder",
      label: "County recorder / deeds",
      live: false,
      planned: true,
      unlocks: "Recorded deeds, transfer dates, document references, and sale events where public.",
      configuredBy: ["county recorder", "deed open data", "operator import"],
      detail: "Planned adapter. These env keys are not consumed by the current property pipeline.",
      env: ["COUNTY_RECORDER_DATA_URL", "DEED_RECORDS_DATA_URL"],
    }),
    source({
      id: "socrata",
      label: "Socrata open-data portals",
      live: configured("OPEN_DISTRESS_DATA_URLS"),
      planned: !configured("OPEN_DISTRESS_DATA_URLS"),
      unlocks: "Municipal code cases, permits, 311 issues, vacant registries, and local datasets.",
      configuredBy: ["Socrata", "city/county open-data portals"],
      detail: configured("OPEN_DISTRESS_DATA_URLS")
        ? "Configured through the generic distress-feed pipeline; every dataset still needs compatible schema and freshness fields."
        : "Use a built-in catalog mapping or OPEN_DISTRESS_DATA_URLS. SOCRATA_OPEN_DATA_URL alone is not consumed.",
      env: ["SOCRATA_OPEN_DATA_URL", "OPEN_DISTRESS_DATA_URLS"],
    }),
    source({
      id: "fema-nfhl",
      label: "FEMA NFHL flood layers",
      live: true,
      unlocks: "US flood-zone evidence cards from official FEMA National Flood Hazard Layer services.",
      configuredBy: ["FEMA NFHL ArcGIS service"],
      detail: configured("FEMA_NFHL_URL")
        ? "A configured FEMA endpoint runs alongside the built-in national layer. Risk context only; not insurance, legal, or engineering advice."
        : "Built in through the verified FEMA NFHL catalog layer. Risk context only; not insurance, legal, or engineering advice.",
      env: ["FEMA_NFHL_URL"],
    }),
    source({
      id: "planning-zoning",
      label: "Planning and zoning GIS",
      live: false,
      planned: true,
      unlocks: "Zoning district, planning cases, permits, overlays, and land-use constraints where public.",
      configuredBy: ["local planning GIS", "municipal open data"],
      detail: "Planned adapter. PLANNING_GIS_URL and ZONING_GIS_URL are not consumed by the current property pipeline.",
      env: ["PLANNING_GIS_URL", "ZONING_GIS_URL", "OPEN_HAZARD_LAYER_URL"],
    }),
    source({
      id: "tax-delinquency",
      label: "Tax delinquency records",
      live: configured("TAX_DELINQUENCY_DATA_URL"),
      unlocks: "Public tax-delinquency signals where legally available.",
      configuredBy: ["county tax collector", "public tax sale lists"],
      detail: "Sensitive lead signal; show source, date, and verify before outreach.",
      env: ["TAX_DELINQUENCY_DATA_URL"],
    }),
    source({
      id: "code-violations",
      label: "Code violation records",
      live: configured("CODE_VIOLATION_DATA_URL"),
      unlocks: "Open code cases, nuisance records, inspection issues, and municipal enforcement signals.",
      configuredBy: ["city/county code enforcement", "open-data portal"],
      detail: "Public distress context only; never shame or imply protected characteristics.",
      env: ["CODE_VIOLATION_DATA_URL"],
    }),
    source({
      id: "vacant-registry",
      label: "Vacant property registry",
      live: configured("VACANT_REGISTRY_DATA_URL"),
      unlocks: "Vacancy registry evidence where cities/counties publish it.",
      configuredBy: ["municipal vacant registry", "open-data portal"],
      detail: "Useful only in markets with a public registry; otherwise Forleads reports a gap.",
      env: ["VACANT_REGISTRY_DATA_URL"],
    }),
    source({
      id: "microsoft-buildings",
      label: "Microsoft building footprints",
      live: false,
      planned: true,
      unlocks: "Open ML building footprints where OSM building coverage is sparse.",
      configuredBy: ["Microsoft Global ML Building Footprints"],
      detail: "Planned adapter. The configured URL is not consumed by the current property pipeline.",
      env: ["MICROSOFT_BUILDING_FOOTPRINTS_URL"],
    }),
    source({
      id: "google-open-buildings",
      label: "Google Open Buildings",
      live: false,
      planned: true,
      unlocks: "Open building detections in regions where cadastral data is sparse.",
      configuredBy: ["Google Open Buildings"],
      detail: "Planned adapter. It must be labeled as ML-derived footprint evidence when implemented.",
      env: ["GOOGLE_OPEN_BUILDINGS_URL", "AFRICA_BUILDINGS_DATA_URL"],
    }),
    source({
      id: "operator-imports",
      label: "Operator CSV proof packs",
      live: configured("OPERATOR_SALES_IMPORT_URL", "OPERATOR_PROPERTY_IMPORT_URL"),
      unlocks: "Agent-owned lists, title-company exports, permitted CSVs, and local source packs.",
      configuredBy: ["operator import", "broker-owned data", "title partner export"],
      detail: "Only use data the agent has rights to use; imports still become sourced evidence cards.",
      env: ["OPERATOR_SALES_IMPORT_URL", "OPERATOR_PROPERTY_IMPORT_URL"],
    }),
    source({
      id: "automation",
      label: "Approved automation bridge",
      live: automationLive,
      unlocks: "Push approved tasks or outreach jobs into n8n/Zapier-style workflows.",
      configuredBy: ["n8n", "webhook receiver", "Zapier-compatible endpoint"],
      detail: automationLive
        ? "Zapier-compatible outbound webhook is configured; automation runs only after human-approved artifacts."
        : "ZAPIER_WEBHOOK_URL is the implemented outbound bridge. N8N_WEBHOOK_URL alone is not wired yet.",
      env: ["N8N_WEBHOOK_URL", "ZAPIER_WEBHOOK_URL"],
    }),
    {
      id: "consented-contact",
      label: "Consented/operator-owned contacts",
      status: "live",
      unlocks: "CRM imports, manually captured contacts, Google/Microsoft account context, and consented records.",
      configuredBy: ["operator input", "Google OAuth", "CRM imports"],
      detail: "Forleads should not infer owner/occupant/contact details from an address alone.",
      env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "FOLLOWUPBOSS_API_KEY", "GHL_API_KEY"],
    },
    source({
      id: "open-buildings",
      label: "Generic open building footprints",
      live: false,
      planned: true,
      unlocks: "Fallback footprint and structure-size context when OSM is sparse.",
      configuredBy: ["Microsoft", "Google Open Buildings", "local GeoJSON"],
      detail: buildingsLive
        ? "A URL is configured, but the generic footprint adapter is not implemented. Building geometry is context, not sale/ownership truth."
        : "Planned adapter. Building geometry will be context, not sale/ownership truth.",
      env: ["MICROSOFT_BUILDING_FOOTPRINTS_URL", "GOOGLE_OPEN_BUILDINGS_URL", "LOCAL_BUILDINGS_GEOJSON_URL", "AFRICA_BUILDINGS_DATA_URL"],
    }),
  ];
}
