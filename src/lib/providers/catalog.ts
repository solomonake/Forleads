// ============================================================================
// Built-in open-data catalog. Every entry here is a REAL, free, publicly
// licensed endpoint verified live before inclusion (verified date on each).
// This is what makes Forleads useful with ZERO env configuration: providers
// fall back to catalog sources whose coverage bbox contains the query point.
//
// Contract: catalog queries return normalized matches, never EvidenceCards —
// the providers in real.ts own the card/grade contract. A source that fails,
// times out, or has no match contributes nothing; it never guesses.
//
// Operator env URLs always run IN ADDITION to the catalog, so a county feed
// the operator adds still wins alongside these defaults.
// ============================================================================

import { getCache } from "@/lib/cache";
import { log } from "@/lib/observability";
import type { PropertyQuery } from "./types";

export type CatalogKind = "sales" | "assessment" | "distress" | "hazard";

export type CatalogStyle =
  | "socrata" // Socrata SODA: ?$q=<address>&$limit=N, JSON array
  | "socrata-eq" // Socrata SODA equality on cfg.queryField — for datasets too big for $q (full-text times out); values are UPPERCASE with USPS suffix abbreviations
  | "carto-sql" // CARTO SQL API: SELECT ... WHERE addr ILIKE '%..%'
  | "opendatasoft" // Opendatasoft Explore v2.1: ?where=field like "..."
  | "hmlr-ppd" // HM Land Registry linked-data API, postcode-keyed
  | "dvf-commune" // France DVF per-commune CSV via geo.api.gouv.fr lookup
  | "arcgis-point"; // ArcGIS REST point-intersection query (hazard layers)

export interface CatalogSource {
  id: string;
  region: "usa" | "canada" | "europe" | "africa";
  market: string;
  kind: CatalogKind;
  style: CatalogStyle;
  url: string;
  name: string;
  homepage: string;
  license: string;
  /** [west, south, east, north] coverage in WGS84. */
  bbox: [number, number, number, number];
  /** Live-verified date; stale entries get re-probed, never trusted. */
  verified: string;
  /** Style-specific config (field names, table, etc.). */
  cfg?: Record<string, string>;
}

export interface CatalogMatch {
  source: CatalogSource;
  address: string;
  /** Price or assessed value, as published. */
  amount?: string;
  date?: string;
  /** Distress label (violation type/status). */
  label?: string;
  recordUrl?: string;
}

export const OPEN_DATA_CATALOG: CatalogSource[] = [
  // ---- USA ------------------------------------------------------------------
  {
    id: "nyc-rolling-sales",
    region: "usa",
    market: "New York City",
    kind: "sales",
    style: "socrata",
    url: "https://data.cityofnewyork.us/resource/usep-8jbt.json",
    name: "NYC Dept. of Finance Rolling Sales",
    homepage: "https://data.cityofnewyork.us/City-Government/NYC-Citywide-Rolling-Calendar-Sales/usep-8jbt",
    license: "NYC Open Data (public domain)",
    bbox: [-74.3, 40.45, -73.65, 40.95],
    verified: "2026-07-05",
    cfg: { address: "address", amount: "sale_price", date: "sale_date" },
  },
  {
    id: "philadelphia-opa-sales",
    region: "usa",
    market: "Philadelphia",
    kind: "sales",
    style: "carto-sql",
    url: "https://phl.carto.com/api/v2/sql",
    name: "Philadelphia OPA Property Records",
    homepage: "https://opendataphilly.org/datasets/philadelphia-properties-and-assessment-history/",
    license: "Open Data Commons (ODbL-style city license)",
    bbox: [-75.3, 39.85, -74.95, 40.15],
    verified: "2026-07-05",
    cfg: { table: "opa_properties_public", address: "location", amount: "sale_price", date: "sale_date" },
  },
  {
    id: "nyc-hpd-violations",
    region: "usa",
    market: "New York City",
    kind: "distress",
    style: "socrata",
    url: "https://data.cityofnewyork.us/resource/wvxf-dwi5.json",
    name: "NYC HPD Housing Violations",
    homepage: "https://data.cityofnewyork.us/Housing-Development/Housing-Maintenance-Code-Violations/wvxf-dwi5",
    license: "NYC Open Data (public domain)",
    bbox: [-74.3, 40.45, -73.65, 40.95],
    verified: "2026-07-05",
    cfg: {
      addressParts: "housenumber streetname boro",
      label: "novdescription",
      labelFallback: "HPD housing violation",
      date: "inspectiondate",
    },
  },
  {
    id: "chicago-building-violations",
    region: "usa",
    market: "Chicago",
    kind: "distress",
    style: "socrata",
    url: "https://data.cityofchicago.org/resource/22u3-xenr.json",
    name: "Chicago Building Violations",
    homepage: "https://data.cityofchicago.org/Buildings/Building-Violations/22u3-xenr",
    license: "Chicago Open Data (public domain)",
    bbox: [-87.95, 41.6, -87.5, 42.05],
    verified: "2026-07-05",
    cfg: { address: "address", label: "violation_description", date: "violation_date" },
  },
  {
    id: "philadelphia-li-violations",
    region: "usa",
    market: "Philadelphia",
    kind: "distress",
    style: "carto-sql",
    url: "https://phl.carto.com/api/v2/sql",
    name: "Philadelphia L&I Code Violations",
    homepage: "https://opendataphilly.org/datasets/licenses-and-inspections-violations/",
    license: "Open Data Commons (ODbL-style city license)",
    bbox: [-75.3, 39.85, -74.95, 40.15],
    verified: "2026-07-05",
    cfg: { table: "violations", address: "address", label: "violationcodetitle", date: "violationdate" },
  },
  {
    id: "fema-nfhl-flood",
    region: "usa",
    market: "United States",
    kind: "hazard",
    style: "arcgis-point",
    url: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query",
    name: "FEMA NFHL",
    homepage: "https://www.fema.gov/flood-maps/national-flood-hazard-layer",
    license: "US Government public domain",
    bbox: [-180, 17, -64, 72],
    verified: "2026-07-05",
  },

  {
    id: "maryland-sdat-sales",
    region: "usa",
    market: "Maryland",
    kind: "sales",
    style: "socrata-eq",
    url: "https://opendata.maryland.gov/resource/ed4q-f8tm.json",
    name: "Maryland SDAT Real Property (sale record)",
    homepage: "https://opendata.maryland.gov/Business-and-Economy/Maryland-Real-Property-Assessments-Hidden-Property/ed4q-f8tm",
    license: "Maryland Open Data (public)",
    bbox: [-79.49, 37.88, -74.98, 39.75],
    verified: "2026-07-12",
    cfg: {
      // 2.4M rows: $q full-text times out; equality on the MDP address field
      // answers in ~1s. Values are UPPERCASE with USPS suffixes ("... RD").
      queryField: "mdp_street_address_mdp_field_address",
      select:
        "mdp_street_address_mdp_field_address AS address, mdp_street_address_city_mdp_field_city AS city, sales_segment_1_consideration_mdp_field_considr1_sdat_field_90 AS sale_price, sales_segment_1_transfer_date_yyyy_mm_dd_mdp_field_tradate_sdat_field_89 AS sale_date",
      address: "address",
      amount: "sale_price",
      date: "sale_date",
    },
  },
  {
    id: "maryland-sdat-assessments",
    region: "usa",
    market: "Maryland",
    kind: "assessment",
    style: "socrata-eq",
    url: "https://opendata.maryland.gov/resource/ed4q-f8tm.json",
    name: "Maryland SDAT Real Property (assessment)",
    homepage: "https://opendata.maryland.gov/Business-and-Economy/Maryland-Real-Property-Assessments-Hidden-Property/ed4q-f8tm",
    license: "Maryland Open Data (public)",
    bbox: [-79.49, 37.88, -74.98, 39.75],
    verified: "2026-07-12",
    cfg: {
      queryField: "mdp_street_address_mdp_field_address",
      select:
        "mdp_street_address_mdp_field_address AS address, current_assessment_year_total_assessment_sdat_field_172 AS assessed, current_cycle_data_date_assessed_yyyy_mm_mdp_field_lastassd_sdat_field_169 AS assessed_date",
      address: "address",
      amount: "assessed",
      date: "assessed_date",
    },
  },
  {
    id: "montgomery-md-code-violations",
    region: "usa",
    market: "Montgomery County, MD",
    kind: "distress",
    style: "socrata",
    url: "https://data.montgomerycountymd.gov/resource/k9nj-z35d.json",
    name: "Montgomery County Housing Code Violations",
    homepage: "https://data.montgomerycountymd.gov/Consumer-Housing/Housing-Code-Violations/k9nj-z35d",
    license: "dataMontgomery (public)",
    bbox: [-77.53, 38.93, -76.87, 39.36],
    verified: "2026-07-12",
    cfg: {
      addressParts: "street_address city",
      label: "condition",
      labelFallback: "Housing code violation",
      date: "date_filed",
    },
  },

  {
    id: "connecticut-sales",
    region: "usa",
    market: "Connecticut",
    kind: "sales",
    style: "socrata-eq",
    url: "https://data.ct.gov/resource/5mzw-sjtu.json",
    name: "Connecticut Real Estate Sales (OPM)",
    homepage: "https://data.ct.gov/Housing-and-Development/Real-Estate-Sales-2001-2023-GL/5mzw-sjtu",
    license: "Connecticut Open Data (public)",
    bbox: [-73.73, 40.95, -71.78, 42.06],
    verified: "2026-07-13",
    cfg: {
      queryField: "address",
      select: "address, town, saleamount, daterecorded",
      order: "daterecorded DESC",
      address: "address",
      amount: "saleamount",
      date: "daterecorded",
    },
  },
  {
    id: "ny-state-assessments",
    region: "usa",
    market: "New York State",
    kind: "assessment",
    style: "socrata-eq",
    url: "https://data.ny.gov/resource/7vem-aaz7.json",
    name: "NY State Local Assessment Rolls",
    homepage: "https://data.ny.gov/Government-Finance/Property-Assessment-Data-from-Local-Assessment-Ro/7vem-aaz7",
    license: "New York Open Data (public)",
    bbox: [-79.77, 40.47, -71.85, 45.02],
    verified: "2026-07-13",
    cfg: {
      // Split, mixed-case address fields — needs the $where template with
      // upper(); statewide, so ambiguous no-city matches are dropped.
      where: "parcel_address_number='{number}' AND upper(parcel_address_street)='{street}'",
      cityWhere: "upper(municipality_name)='{city}'",
      ambiguityField: "municipality_name",
      select:
        "parcel_address_number, parcel_address_street, parcel_address_suff, municipality_name, full_market_value, roll_year",
      order: "roll_year DESC",
      addressParts: "parcel_address_number parcel_address_street parcel_address_suff",
      amount: "full_market_value",
      date: "roll_year",
    },
  },
  {
    id: "nola-code-violations",
    region: "usa",
    market: "New Orleans",
    kind: "distress",
    style: "socrata",
    url: "https://data.nola.gov/resource/3ehi-je3s.json",
    name: "New Orleans Code Enforcement Violations",
    homepage: "https://data.nola.gov/Housing-Land-Use-and-Blight/Code-Enforcement-All-Violations/3ehi-je3s",
    license: "NOLA Open Data (public)",
    bbox: [-90.14, 29.87, -89.62, 30.2],
    verified: "2026-07-13",
    cfg: { address: "location", label: "violation", date: "violationdate" },
  },
  {
    id: "cincinnati-code-enforcement",
    region: "usa",
    market: "Cincinnati",
    kind: "distress",
    style: "socrata",
    url: "https://data.cincinnati-oh.gov/resource/cncm-znd6.json",
    name: "Cincinnati Code Enforcement",
    homepage: "https://data.cincinnati-oh.gov/Thriving-Neighborhoods/Code-Enforcement/cncm-znd6",
    license: "CincyInsights (public)",
    bbox: [-84.72, 39.02, -84.36, 39.22],
    verified: "2026-07-13",
    cfg: { address: "full_address", label: "comp_type_desc", date: "entered_date" },
  },

  // ---- Canada ---------------------------------------------------------------
  {
    id: "calgary-assessments",
    region: "canada",
    market: "Calgary",
    kind: "assessment",
    style: "socrata",
    url: "https://data.calgary.ca/resource/4bsw-nn7w.json",
    name: "City of Calgary Property Assessments",
    homepage: "https://data.calgary.ca/dataset/Current-Year-Property-Assessments-Parcel-/4bsw-nn7w",
    license: "Open Government Licence – Calgary",
    bbox: [-114.35, 50.8, -113.8, 51.25],
    verified: "2026-07-05",
    cfg: { address: "address", amount: "assessed_value", date: "roll_year" },
  },
  {
    id: "edmonton-assessments",
    region: "canada",
    market: "Edmonton",
    kind: "assessment",
    style: "socrata",
    url: "https://data.edmonton.ca/resource/q7d6-ambg.json",
    name: "City of Edmonton Property Assessments",
    homepage: "https://data.edmonton.ca/City-Administration/Property-Assessment-Data-Current-Calendar-Year-/q7d6-ambg",
    license: "Open Government Licence – Edmonton",
    bbox: [-113.75, 53.35, -113.25, 53.75],
    verified: "2026-07-05",
    cfg: { addressParts: "house_number street_name", amount: "assessed_value" },
  },
  {
    id: "winnipeg-assessments",
    region: "canada",
    market: "Winnipeg",
    kind: "assessment",
    style: "socrata",
    url: "https://data.winnipeg.ca/resource/d4mq-wa44.json",
    name: "City of Winnipeg Assessment Parcels",
    homepage: "https://data.winnipeg.ca/Assessment-Taxation-Corporate/Assessment-Parcels/d4mq-wa44",
    license: "Open Government Licence – Winnipeg",
    bbox: [-97.4, 49.7, -96.9, 50.0],
    verified: "2026-07-05",
    cfg: { address: "full_address", amount: "total_assessed_value", date: "assessment_date" },
  },
  {
    id: "vancouver-property-tax",
    region: "canada",
    market: "Vancouver",
    kind: "assessment",
    style: "opendatasoft",
    url: "https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/property-tax-report/records",
    name: "City of Vancouver Property Tax Report",
    homepage: "https://opendata.vancouver.ca/explore/dataset/property-tax-report/",
    license: "Open Government Licence – Vancouver",
    bbox: [-123.27, 49.19, -123.02, 49.32],
    verified: "2026-07-05",
  },

  // ---- Europe ---------------------------------------------------------------
  {
    id: "hmlr-price-paid",
    region: "europe",
    market: "England & Wales",
    kind: "sales",
    style: "hmlr-ppd",
    url: "https://landregistry.data.gov.uk/data/ppi/transaction-record.json",
    name: "HM Land Registry Price Paid Data",
    homepage: "https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads",
    license: "Open Government Licence v3",
    bbox: [-6.5, 49.8, 1.8, 55.9],
    verified: "2026-07-05",
  },
  {
    id: "ea-flood-zone-3",
    region: "europe",
    market: "England",
    kind: "hazard",
    style: "arcgis-point",
    url: "https://environment.data.gov.uk/KB6uNVj5ZcJr7jUP/ArcGIS/rest/services/Flood_Map_for_Planning/FeatureServer/1/query",
    name: "EA Flood Zone 3",
    homepage: "https://environment.data.gov.uk/dataset/87446770-d465-11e4-b97a-f0def148f590",
    license: "Open Government Licence v3",
    bbox: [-6.5, 49.8, 1.8, 55.9],
    verified: "2026-07-05",
  },
  {
    id: "ea-flood-zone-2",
    region: "europe",
    market: "England",
    kind: "hazard",
    style: "arcgis-point",
    url: "https://environment.data.gov.uk/KB6uNVj5ZcJr7jUP/ArcGIS/rest/services/Flood_Map_for_Planning/FeatureServer/2/query",
    name: "EA Flood Zone 2",
    homepage: "https://environment.data.gov.uk/dataset/04532375-a198-476e-985e-0579a0a11b47",
    license: "Open Government Licence v3",
    bbox: [-6.5, 49.8, 1.8, 55.9],
    verified: "2026-07-05",
  },
  {
    id: "france-dvf",
    region: "europe",
    market: "France",
    kind: "sales",
    style: "dvf-commune",
    url: "https://files.data.gouv.fr/geo-dvf/latest/csv",
    name: "DVF – Demandes de valeurs foncières (Etalab)",
    homepage: "https://www.data.gouv.fr/fr/datasets/demandes-de-valeurs-foncieres-geolocalisees/",
    license: "Licence Ouverte 2.0",
    bbox: [-5.2, 41.3, 9.6, 51.1],
    verified: "2026-07-05",
  },
];

// Africa has no live free valuation/sales endpoint we could verify (Cape Town's
// Open_Data_Service FeatureServer was down on 2026-07-05, checked twice).
// OSM buildings + field capture + operator imports carry that region, and the
// readiness panel says so honestly instead of listing a dead feed.

const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // public, slow-changing records

function contains(bbox: [number, number, number, number], lng: number, lat: number): boolean {
  return lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

export function catalogSourcesAt(lng: number, lat: number, kinds: CatalogKind[]): CatalogSource[] {
  return OPEN_DATA_CATALOG.filter((s) => kinds.includes(s.kind) && contains(s.bbox, lng, lat));
}

/** Hazard endpoints covering a point, for the risk provider's ArcGIS loop. */
export function catalogHazardEndpoints(lng: number, lat: number): { url: string; name: string; homepage: string }[] {
  return catalogSourcesAt(lng, lat, ["hazard"]).map((s) => ({ url: s.url, name: s.name, homepage: s.homepage }));
}

/** The street portion of an address ("272 East 3 Street, Manhattan" → "272 East 3 Street"). */
function streetPart(address: string): string {
  return (address.split(",")[0] ?? address).trim();
}

/** UK postcode anywhere in the address string. */
function ukPostcode(address: string): string | null {
  const m = address.toUpperCase().match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/);
  return m ? m[0].replace(/\s+/, " ").trim() : null;
}

/** USPS street-suffix abbreviations shared by matching and query building. */
const STREET_SUFFIXES: [full: string, abbr: string][] = [
  ["road", "rd"],
  ["street", "st"],
  ["avenue", "ave"],
  ["drive", "dr"],
  ["lane", "ln"],
  ["court", "ct"],
  ["place", "pl"],
  ["boulevard", "blvd"],
  ["parkway", "pkwy"],
  ["circle", "cir"],
  ["terrace", "ter"],
  ["highway", "hwy"],
  ["trail", "trl"],
  ["square", "sq"],
  // Non-USPS variants seen in live portals (Cincinnati uses "AV").
  ["av", "ave"],
];

export function normalizeAddress(value: string): string {
  let out = value.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  for (const [full, abbr] of STREET_SUFFIXES) {
    out = out.replace(new RegExp(`\\b${full}\\b`, "g"), abbr);
  }
  return out.trim();
}

/**
 * Query candidates for US equality-filtered datasets that store UPPERCASE
 * addresses with USPS suffixes ("22125 CLARKSBURG RD"): abbreviated form
 * first, raw uppercase as fallback.
 */
function usStreetVariants(street: string): string[] {
  const raw = street.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  let abbr = raw;
  for (const [full, short] of STREET_SUFFIXES) {
    abbr = abbr.replace(new RegExp(`\\b${full.toUpperCase()}\\b`, "g"), short.toUpperCase());
  }
  return abbr === raw ? [raw] : [abbr, raw];
}

export function addressesMatch(candidate: string, target: string): boolean {
  const t = normalizeAddress(target);
  const c = normalizeAddress(candidate);
  if (!t || !c) return false;
  if (c === t) return true;

  const targetTokens = t.split(" ");
  const candidateTokens = c.split(" ");
  if (targetTokens.length < 3 || candidateTokens.length < 3) return false;
  if (targetTokens[0] !== candidateTokens[0]) return false;
  const targetStreet = targetTokens.slice(1);
  const candidateStreet = candidateTokens.slice(1);
  const shared = Math.min(targetStreet.length, candidateStreet.length);
  if (shared < 2) return false;
  if (targetStreet.slice(0, 2).join(" ") === candidateStreet.slice(0, 2).join(" ")) return true;
  return targetStreet.slice(0, shared).join(" ") === candidateStreet.slice(0, shared).join(" ");
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": "Forleads/1.0 (open-data real-estate CRM; +https://forleads.vercel.app)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json();
}

function str(record: Record<string, unknown>, key: string | undefined): string | undefined {
  if (!key) return undefined;
  const v = record[key];
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function composedAddress(record: Record<string, unknown>, cfg: Record<string, string>): string | undefined {
  if (cfg.address) return str(record, cfg.address);
  if (cfg.addressParts) {
    const parts = cfg.addressParts
      .split(" ")
      .map((k) => str(record, k))
      .filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : undefined;
  }
  return undefined;
}

function isoDay(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const day = value.slice(0, 10);
  // SDAT publishes dot-separated dates ("2021.12.13", "2024.01"); normalize
  // to ISO so the card shows a real as-of date instead of "date unknown".
  if (/^\d{4}\.\d{2}(\.\d{2})?$/.test(day)) return day.replace(/\./g, "-");
  return day;
}

// ---- Style handlers ---------------------------------------------------------

async function querySocrata(source: CatalogSource, q: PropertyQuery): Promise<CatalogMatch[]> {
  const cfg = source.cfg ?? {};
  const street = streetPart(q.address);
  if (!street) return [];
  const url = `${source.url}?$q=${encodeURIComponent(street)}&$limit=25`;
  const data = (await fetchJson(url)) as Record<string, unknown>[];
  if (!Array.isArray(data)) return [];
  const matches: CatalogMatch[] = [];
  for (const record of data) {
    const address = composedAddress(record, cfg);
    if (!address || !addressesMatch(address, street)) continue;
    matches.push({
      source,
      address,
      amount: str(record, cfg.amount),
      date: isoDay(str(record, cfg.date)),
      label: str(record, cfg.label) ?? cfg.labelFallback,
    });
  }
  return matches;
}

/**
 * SoQL $where template for datasets whose address lives in SPLIT, mixed-case
 * fields (NY: parcel_address_number + parcel_address_street). Tokens:
 * {number} house number, {street} UPPERCASE street name without its suffix
 * token, {city} optional (cfg.cityWhere appended only when the query address
 * carries a city part). Statewide split-field data is ambiguous across towns,
 * so when no city is known and cfg.ambiguityField values differ, the source
 * contributes nothing rather than guessing.
 */
async function querySocrataWhere(source: CatalogSource, q: PropertyQuery, street: string): Promise<CatalogMatch[]> {
  const cfg = source.cfg ?? {};
  const m = street.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").trim().match(/^(\d+[A-Z]?)\s+(.+)$/);
  if (!m) return [];
  const esc = (s: string) => s.replace(/'/g, "''");
  const tokens = m[2]!.split(/\s+/);
  const suffixTokens = new Set(STREET_SUFFIXES.flatMap(([full, abbr]) => [full.toUpperCase(), abbr.toUpperCase()]));
  const streetName = tokens.length > 1 && suffixTokens.has(tokens[tokens.length - 1]!) ? tokens.slice(0, -1).join(" ") : m[2]!;

  let where = cfg.where!.replace("{number}", esc(m[1]!)).replace("{street}", esc(streetName));
  const cityPart = (q.address.split(",")[1] ?? "").replace(/[^A-Za-z0-9 ]/g, " ").trim().toUpperCase();
  if (cfg.cityWhere && cityPart) where += ` AND ${cfg.cityWhere.replace("{city}", esc(cityPart))}`;

  const params = new URLSearchParams({ $where: where, $limit: "25" });
  if (cfg.select) params.set("$select", cfg.select);
  if (cfg.order) params.set("$order", cfg.order);
  const data = (await fetchJson(`${source.url}?${params.toString()}`)) as Record<string, unknown>[];
  if (!Array.isArray(data)) return [];

  const matches: CatalogMatch[] = [];
  for (const record of data) {
    const address = composedAddress(record, cfg);
    if (!address || !addressesMatch(address, street)) continue;
    matches.push({
      source,
      address,
      amount: str(record, cfg.amount),
      date: isoDay(str(record, cfg.date)),
      label: str(record, cfg.label) ?? cfg.labelFallback,
    });
  }
  if (!cityPart && cfg.ambiguityField) {
    const places = new Set(data.map((r) => str(r, cfg.ambiguityField)).filter(Boolean));
    if (places.size > 1) return [];
  }
  return matches;
}

async function querySocrataEq(source: CatalogSource, q: PropertyQuery): Promise<CatalogMatch[]> {
  const cfg = source.cfg ?? {};
  const street = streetPart(q.address);
  if (!street) return [];
  if (cfg.where) return querySocrataWhere(source, q, street);
  if (!cfg.queryField) return [];
  for (const candidate of usStreetVariants(street)) {
    const params = new URLSearchParams();
    params.set(cfg.queryField, candidate);
    if (cfg.select) params.set("$select", cfg.select);
    if (cfg.order) params.set("$order", cfg.order);
    params.set("$limit", "25");
    const data = (await fetchJson(`${source.url}?${params.toString()}`)) as Record<string, unknown>[];
    if (!Array.isArray(data) || data.length === 0) continue;
    const matches: CatalogMatch[] = [];
    for (const record of data) {
      const address = composedAddress(record, cfg);
      if (!address || !addressesMatch(address, street)) continue;
      matches.push({
        source,
        address,
        amount: str(record, cfg.amount),
        date: isoDay(str(record, cfg.date)),
        label: str(record, cfg.label) ?? cfg.labelFallback,
      });
    }
    if (matches.length > 0) return matches;
  }
  return [];
}

async function queryCarto(source: CatalogSource, q: PropertyQuery): Promise<CatalogMatch[]> {
  const cfg = source.cfg ?? {};
  const street = streetPart(q.address);
  if (!street || !cfg.table || !cfg.address) return [];
  // String-literal escape only — the address goes inside single quotes and the
  // rest of the statement is built from catalog constants, never user input.
  const escaped = street.replace(/\\/g, "").replace(/'/g, "''");
  const cols = [cfg.address, cfg.amount, cfg.date, cfg.label].filter(Boolean).join(", ");
  const sql = `SELECT ${cols} FROM ${cfg.table} WHERE ${cfg.address} ILIKE '%${escaped}%' LIMIT 25`;
  const data = (await fetchJson(`${source.url}?q=${encodeURIComponent(sql)}`)) as { rows?: Record<string, unknown>[] };
  const matches: CatalogMatch[] = [];
  for (const record of data.rows ?? []) {
    const address = str(record, cfg.address);
    if (!address || !addressesMatch(address, street)) continue;
    matches.push({
      source,
      address,
      amount: str(record, cfg.amount),
      date: isoDay(str(record, cfg.date)),
      label: str(record, cfg.label),
    });
  }
  return matches;
}

async function queryOpendatasoft(source: CatalogSource, q: PropertyQuery): Promise<CatalogMatch[]> {
  // Vancouver property-tax-report: street_name + civic number range, assessed
  // land + improvement values. Busy streets have >1000 rows, so the civic
  // number must be part of the server-side filter, not just local matching.
  const street = streetPart(q.address);
  const civicNumber = street.match(/^(\d+)/)?.[1];
  const streetName = street.replace(/^\d+[a-z]?\s+/i, "").trim();
  if (!streetName) return [];
  const escaped = streetName.replace(/"/g, "").toUpperCase();
  const where = civicNumber
    ? `street_name like "${escaped}" and (from_civic_number = "${civicNumber}" or to_civic_number = "${civicNumber}")`
    : `street_name like "${escaped}"`;
  const url = `${source.url}?where=${encodeURIComponent(where)}&limit=50`;
  const data = (await fetchJson(url)) as { results?: Record<string, unknown>[] };
  const matches: CatalogMatch[] = [];
  for (const record of data.results ?? []) {
    const civic = str(record, "from_civic_number") ?? str(record, "to_civic_number");
    const name = str(record, "street_name");
    if (!civic || !name) continue;
    const address = `${civic} ${name}`;
    if (!addressesMatch(address, street)) continue;
    const land = Number(record["current_land_value"] ?? 0);
    const improvement = Number(record["current_improvement_value"] ?? 0);
    const total = land + improvement;
    matches.push({
      source,
      address,
      amount: total > 0 ? String(total) : undefined,
      date: str(record, "tax_assessment_year"),
    });
  }
  return matches;
}

interface HmlrItem {
  pricePaid?: number;
  transactionDate?: string;
  propertyAddress?: { paon?: string; saon?: string; street?: string; town?: string; postcode?: string };
}

async function queryHmlr(source: CatalogSource, q: PropertyQuery): Promise<CatalogMatch[]> {
  const postcode = ukPostcode(q.address);
  if (!postcode) return []; // Without a postcode the PPD API can't be scoped; skip, never guess.
  const url = `${source.url}?propertyAddress.postcode=${encodeURIComponent(postcode)}&_pageSize=50`;
  const data = (await fetchJson(url)) as { result?: { items?: HmlrItem[] } };
  const street = streetPart(q.address);
  const matches: CatalogMatch[] = [];
  for (const item of data.result?.items ?? []) {
    const a = item.propertyAddress ?? {};
    // PAON can be a house number OR a house name with the unit in SAON
    // ("ROSEMOUNT COTTAGE" saon "3"), so try both compositions before
    // claiming the record is about THIS address. Same postcode is already a
    // tight scope; the street line still has to line up.
    const compositions = [
      [a.paon, a.street, a.town, a.postcode],
      [a.saon, a.paon, a.street, a.town, a.postcode],
    ].map((parts) => parts.filter(Boolean).join(" "));
    const address = compositions[1] || compositions[0];
    if (!address || !item.pricePaid) continue;
    if (!compositions.some((candidate) => candidate && addressesMatch(candidate, street))) continue;
    matches.push({
      source,
      address,
      amount: `£${item.pricePaid.toLocaleString("en-GB")}`,
      date: isoDay(item.transactionDate),
    });
  }
  return matches;
}

interface DvfCommune {
  code: string;
  departement: string;
}

async function dvfCommuneFor(lng: number, lat: number): Promise<DvfCommune | null> {
  // Paris/Lyon/Marseille publish DVF per arrondissement; ask for that first.
  for (const type of ["arrondissement-municipal", ""] as const) {
    const typeParam = type ? `&type=${type}` : "";
    try {
      const data = (await fetchJson(
        `https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lng}&fields=code,codeDepartement${typeParam}`,
      )) as { code?: string; codeDepartement?: string }[];
      const hit = Array.isArray(data) ? data[0] : undefined;
      if (hit?.code) {
        return { code: hit.code, departement: hit.codeDepartement ?? hit.code.slice(0, 2) };
      }
    } catch {
      // fall through to the broader commune lookup
    }
  }
  return null;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

async function loadDvfRows(source: CatalogSource, commune: DvfCommune): Promise<Record<string, string>[]> {
  const cache = getCache();
  const cacheKey = `dvf:${commune.code}`;
  const cached = cache.get<Record<string, string>[]>(cacheKey);
  if (cached) return cached;

  const thisYear = new Date().getFullYear();
  for (const year of [thisYear, thisYear - 1, thisYear - 2]) {
    const url = `${source.url}/${year}/communes/${commune.departement}/${commune.code}.csv`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS + 4000),
        headers: { "User-Agent": "Forleads/1.0 (open-data real-estate CRM)" },
        redirect: "follow",
      });
      if (!res.ok) continue;
      const text = await res.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (lines.length < 2) continue;
      const headers = parseCsvLine(lines[0]!);
      const rows = lines.slice(1).map((line) => {
        const cells = parseCsvLine(line);
        const row: Record<string, string> = {};
        headers.forEach((h, i) => {
          row[h] = cells[i] ?? "";
        });
        return row;
      });
      cache.set(cacheKey, rows, CACHE_TTL_MS);
      return rows;
    } catch {
      // try the previous vintage
    }
  }
  return [];
}

async function queryDvf(source: CatalogSource, q: PropertyQuery): Promise<CatalogMatch[]> {
  const commune = await dvfCommuneFor(q.lng, q.lat);
  if (!commune) return [];
  const rows = await loadDvfRows(source, commune);
  const street = streetPart(q.address);
  const matches: CatalogMatch[] = [];
  for (const row of rows) {
    const address = [row["adresse_numero"], row["adresse_suffixe"], row["adresse_nom_voie"], row["nom_commune"]]
      .filter((part) => part && part.trim() !== "")
      .join(" ");
    const price = row["valeur_fonciere"];
    if (!address || !price || !addressesMatch(address, street)) continue;
    matches.push({
      source,
      address,
      amount: `€${Number(price).toLocaleString("fr-FR")}`,
      date: isoDay(row["date_mutation"]),
    });
  }
  return matches;
}

// ---- Public query surface ----------------------------------------------------

const HANDLERS: Record<Exclude<CatalogStyle, "arcgis-point">, (s: CatalogSource, q: PropertyQuery) => Promise<CatalogMatch[]>> = {
  socrata: querySocrata,
  "socrata-eq": querySocrataEq,
  "carto-sql": queryCarto,
  opendatasoft: queryOpendatasoft,
  "hmlr-ppd": queryHmlr,
  "dvf-commune": queryDvf,
};

async function queryKinds(q: PropertyQuery, kinds: CatalogKind[]): Promise<CatalogMatch[]> {
  const sources = catalogSourcesAt(q.lng, q.lat, kinds).filter((s) => s.style !== "arcgis-point");
  if (sources.length === 0) return [];
  const settled = await Promise.allSettled(
    sources.map((source) => HANDLERS[source.style as Exclude<CatalogStyle, "arcgis-point">](source, q)),
  );
  const matches: CatalogMatch[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      matches.push(...result.value);
    } else {
      log("warn", "catalog.source.failed", {
        source: sources[i]!.id,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });
  return matches;
}

/** Sale + assessed-value records matching this address from built-in sources. */
export function queryCatalogSales(q: PropertyQuery): Promise<CatalogMatch[]> {
  return queryKinds(q, ["sales", "assessment"]);
}

/** Public distress records (violations etc.) matching this address. */
export function queryCatalogDistress(q: PropertyQuery): Promise<CatalogMatch[]> {
  return queryKinds(q, ["distress"]);
}

/** True if any built-in source of these kinds covers the point. */
export function catalogCovers(lng: number, lat: number, kinds: CatalogKind[]): boolean {
  return catalogSourcesAt(lng, lat, kinds).length > 0;
}

/** Region summary for the readiness panel: which markets ship built in. */
export function catalogRegionSummary(): Record<string, { markets: string[]; kinds: CatalogKind[] }> {
  const out: Record<string, { markets: string[]; kinds: CatalogKind[] }> = {};
  for (const s of OPEN_DATA_CATALOG) {
    const entry = (out[s.region] ??= { markets: [], kinds: [] });
    if (!entry.markets.includes(s.market)) entry.markets.push(s.market);
    if (!entry.kinds.includes(s.kind)) entry.kinds.push(s.kind);
  }
  return out;
}
