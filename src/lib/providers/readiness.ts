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

export function dataSourceReadiness(): DataSourceReadiness[] {
  const nominatimLive = config.geocoder === "nominatim" || config.geocoder === "photon-nominatim";
  const photonLive = config.geocoder === "photon-nominatim";
  const mapillaryLive = config.imageryProvider === "mapillary" && configured("MAPILLARY_TOKEN");
  const googleStreetViewLive =
    config.imageryProvider === "google-street-view" && configured("GOOGLE_MAPS_API_KEY");
  const fieldPhotoLive = configured("FIELD_PHOTO_STORAGE", "NEXT_PUBLIC_FIELD_PHOTOS");
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
  const automationLive = configured("N8N_WEBHOOK_URL", "ZAPIER_WEBHOOK_URL");

  return [
    source({
      id: "osm-overpass",
      label: "OpenStreetMap / Overpass",
      live: config.propertyProvider === "osm" || config.propertyProvider === "open-data",
      unlocks: "Building tags, land use, address context, and the global free map floor.",
      configuredBy: ["OpenStreetMap", "Overpass", "self-hosted OSM extracts"],
      detail: "Good for map/building context, not owner identity, legal parcel truth, or sale-price truth.",
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
      live: configured("OPEN_ADDRESSES_URL"),
      unlocks: "Structured open address points where country/region coverage exists.",
      configuredBy: ["OpenAddresses extract", "operator-hosted mirror"],
      detail: "Use as a cached address reference, not as a replacement for local assessor or MLS truth.",
      env: ["OPEN_ADDRESSES_URL"],
    }),
    source({
      id: "census-tiger",
      label: "US Census TIGER/Line",
      live: configured("CENSUS_TIGER_LINE_URL"),
      unlocks: "US streets, boundaries, and geographic context for routing and market areas.",
      configuredBy: ["US Census TIGER/Line"],
      detail: "Useful for US geography context; does not prove property ownership or condition.",
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
      configuredBy: ["Forleads mobile capture", "operator upload", "storage bucket"],
      detail: fieldPhotoLive ? "Field photo storage is configured." : "Most trustworthy for current condition, but needs upload/storage wiring.",
      env: ["FIELD_PHOTO_STORAGE", "NEXT_PUBLIC_FIELD_PHOTOS"],
    },
    source({
      id: "reso-web-api",
      label: "RESO Web API / MLS",
      live: configuredAll("RESO_WEB_API_URL", "RESO_ACCESS_TOKEN"),
      unlocks: "Authorized listing facts, status, media, broker fields, and standardized property resources.",
      configuredBy: ["RESO Web API", "broker/MLS agreement"],
      detail: "Requires authorization. MLS media cannot be shown unless the agent/broker has rights.",
      env: ["RESO_WEB_API_URL", "RESO_ACCESS_TOKEN"],
    }),
    source({
      id: "mls-grid",
      label: "MLS Grid",
      live: configuredAll("MLS_GRID_URL", "MLS_GRID_ACCESS_TOKEN"),
      unlocks: "Authorized MLS listing and media feed in participating markets.",
      configuredBy: ["MLS Grid license", "broker/MLS approval"],
      detail: "Setup required; never scrape MLS photos or display them without rights.",
      env: ["MLS_GRID_URL", "MLS_GRID_ACCESS_TOKEN"],
    }),
    source({
      id: "attom",
      label: "ATTOM property data",
      live: configured("ATTOM_API_KEY"),
      unlocks: "US parcel, assessor, deed, mortgage, valuation, and property characteristics where licensed.",
      configuredBy: ["ATTOM Property Data API"],
      detail: "Paid/licensed source. Must show ATTOM provenance and cache within license terms.",
      env: ["ATTOM_API_KEY"],
    }),
    source({
      id: "rentcast",
      label: "RentCast",
      live: configured("RENTCAST_API_KEY"),
      unlocks: "Rental estimates, sale comps, market rent context, and property data where covered.",
      configuredBy: ["RentCast API"],
      detail: "Useful for valuation context; estimates must not be presented as recorded sale facts.",
      env: ["RENTCAST_API_KEY"],
    }),
    source({
      id: "regrid",
      label: "Regrid parcels",
      live: configured("REGRID_API_KEY"),
      unlocks: "Parcel boundaries, property records, zoning, and building data where licensed.",
      configuredBy: ["Regrid API"],
      detail: "Parcel truth source for US coverage when licensed; show source and freshness.",
      env: ["REGRID_API_KEY"],
    }),
    source({
      id: "reportall",
      label: "ReportAll parcels",
      live: configured("REPORTALL_API_KEY"),
      unlocks: "Parcel boundaries, owner/assessor fields, and county property attributes where licensed.",
      configuredBy: ["ReportAll API"],
      detail: "Paid parcel source; owner/contact use must respect law and outreach policy.",
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
      live: configured("COUNTY_RECORDER_DATA_URL", "DEED_RECORDS_DATA_URL"),
      unlocks: "Recorded deeds, transfer dates, document references, and sale events where public.",
      configuredBy: ["county recorder", "deed open data", "operator import"],
      detail: "Best for transaction proof where available; document-level data needs careful matching.",
      env: ["COUNTY_RECORDER_DATA_URL", "DEED_RECORDS_DATA_URL"],
    }),
    source({
      id: "socrata",
      label: "Socrata open-data portals",
      live: configured("SOCRATA_OPEN_DATA_URL", "OPEN_DISTRESS_DATA_URLS"),
      unlocks: "Municipal code cases, permits, 311 issues, vacant registries, and local datasets.",
      configuredBy: ["Socrata", "city/county open-data portals"],
      detail: "Good local public-record lane; each dataset needs its own schema mapping and freshness display.",
      env: ["SOCRATA_OPEN_DATA_URL", "OPEN_DISTRESS_DATA_URLS"],
    }),
    source({
      id: "fema-nfhl",
      label: "FEMA NFHL flood layers",
      live: configured("FEMA_NFHL_URL"),
      unlocks: "US flood-zone evidence cards from official FEMA National Flood Hazard Layer services.",
      configuredBy: ["FEMA NFHL ArcGIS service"],
      detail: "Risk context only; not insurance, legal, or engineering advice.",
      env: ["FEMA_NFHL_URL"],
    }),
    source({
      id: "planning-zoning",
      label: "Planning and zoning GIS",
      live: configured("PLANNING_GIS_URL", "ZONING_GIS_URL", "OPEN_HAZARD_LAYER_URL"),
      unlocks: "Zoning district, planning cases, permits, overlays, and land-use constraints where public.",
      configuredBy: ["local planning GIS", "municipal open data"],
      detail: "Local schema mapping required before claims become non-D evidence.",
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
      live: configured("MICROSOFT_BUILDING_FOOTPRINTS_URL"),
      unlocks: "Open ML building footprints where OSM building coverage is sparse.",
      configuredBy: ["Microsoft Global ML Building Footprints"],
      detail: "Footprint evidence, not property ownership or sale value.",
      env: ["MICROSOFT_BUILDING_FOOTPRINTS_URL"],
    }),
    source({
      id: "google-open-buildings",
      label: "Google Open Buildings",
      live: configured("GOOGLE_OPEN_BUILDINGS_URL", "AFRICA_BUILDINGS_DATA_URL"),
      unlocks: "Open building detections in regions where cadastral data is sparse.",
      configuredBy: ["Google Open Buildings"],
      detail: "Great for coverage in many global regions; must be labeled as ML-derived footprint evidence.",
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
      detail: automationLive ? "Automation bridge configured." : "Automation only runs after human-approved artifacts.",
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
      id: "open-sales",
      label: "Generic open sale records",
      live: openSalesLive,
      unlocks: "Open CSV/JSON sale rows in markets not covered by a dedicated provider adapter yet.",
      configuredBy: ["public CSV/JSON feed", "operator-hosted source pack"],
      detail: "Every row must pass address, sale date, price, source, and freshness checks before becoming evidence.",
      env: ["OPEN_SALES_DATA_URL", "OPEN_SALES_DATA_URLS", "OPERATOR_SALES_IMPORT_URL"],
    }),
    source({
      id: "open-distress",
      label: "Generic open distress records",
      live: openDistressLive,
      unlocks: "Open distress rows for tax, vacancy, code, foreclosure, nuisance, or permit signals.",
      configuredBy: ["public CSV/JSON feed", "municipal open data"],
      detail: "Each dataset must be mapped and cited; unknown schemas stay D-grade.",
      env: ["OPEN_DISTRESS_DATA_URL", "OPEN_DISTRESS_DATA_URLS"],
    }),
    source({
      id: "open-hazard",
      label: "Generic open hazard layers",
      live: hazardLive,
      unlocks: "Flood, fire, environmental, or local hazard context from public GIS layers.",
      configuredBy: ["ArcGIS REST", "local hazard GIS", "open environmental layers"],
      detail: "Risk evidence must cite the layer and avoid legal/insurance conclusions.",
      env: ["OPEN_HAZARD_LAYER_URL", "US_HAZARD_LAYER_URL", "UK_HAZARD_LAYER_URL", "EU_HAZARD_LAYER_URL", "AFRICA_HAZARD_LAYER_URL"],
    }),
    source({
      id: "open-buildings",
      label: "Generic open building footprints",
      live: buildingsLive,
      unlocks: "Fallback footprint and structure-size context when OSM is sparse.",
      configuredBy: ["Microsoft", "Google Open Buildings", "local GeoJSON"],
      detail: "Building geometry is context, not sale/ownership truth.",
      env: ["MICROSOFT_BUILDING_FOOTPRINTS_URL", "GOOGLE_OPEN_BUILDINGS_URL", "LOCAL_BUILDINGS_GEOJSON_URL", "AFRICA_BUILDINGS_DATA_URL"],
    }),
  ];
}
