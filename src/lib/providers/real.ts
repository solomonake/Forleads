// ============================================================================
// Real provider adapters. Same typed contracts as the mocks; activated by env.
// These make real network calls and STILL enforce the EvidenceCard contract —
// any claim without a source becomes a grade-D gap, never a naked number.
// ============================================================================

import type { EvidenceCard } from "@/lib/core/types";
import { log } from "@/lib/observability";
import {
  addressesMatch,
  catalogCovers,
  catalogHazardEndpoints,
  queryCatalogDistress,
  queryCatalogSales,
  type CatalogMatch,
} from "./catalog";
import type {
  GeocodeProvider,
  GeoResult,
  ImageryProvider,
  PropertyDataProvider,
  PropertyQuery,
  RiskDataProvider,
} from "./types";

interface OpenSaleRecord {
  address: string;
  property_address?: string;
  site_address?: string;
  street_address?: string;
  full_address?: string;
  price?: string;
  sale_price?: string;
  amount?: string;
  sale_date?: string;
  date?: string;
  source?: string;
  source_url?: string;
  url?: string;
}

interface OpenPublicRecord {
  address?: string;
  property_address?: string;
  site_address?: string;
  street_address?: string;
  full_address?: string;
  location?: string | { human_address?: string; address?: string };
  record_type?: string;
  type?: string;
  category?: string;
  status?: string;
  description?: string;
  violation_type?: string;
  case_type?: string;
  date?: string;
  created_date?: string;
  inspection_date?: string;
  source?: string;
  source_url?: string;
  url?: string;
}

type PublicRecordBag = OpenPublicRecord & Record<string, unknown>;

interface ArcGisFeature {
  attributes?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

interface MapillaryImage {
  id: string;
  thumb_1024_url?: string;
  captured_at?: string;
}

interface GoogleStreetViewMetadata {
  status?: string;
  date?: string;
  copyright?: string;
  pano_id?: string;
  location?: { lat?: number; lng?: number };
}

type OperatorMediaRecord = PublicRecordBag & {
  address?: string;
  image_url?: string;
  photo_url?: string;
  media_url?: string;
  thumbnail_url?: string;
  captured_at?: string;
  captured_date?: string;
  rights?: string;
  license?: string;
  usage_rights?: string;
  attribution?: string;
};

function queryProblem(input: PropertyQuery, options: { requireAddress?: boolean } = {}): string | null {
  if (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180) {
    return "Longitude is outside the valid world range.";
  }
  if (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90) {
    return "Latitude is outside the valid world range.";
  }
  if (options.requireAddress && input.address.trim() === "") {
    return "Address is required before matching public records.";
  }
  return null;
}

function gapCard(scout: EvidenceCard["scout"], claim: string, reasoning: string): EvidenceCard {
  return {
    scout,
    claim,
    value: null,
    sources: [],
    confidence: "D",
    reasoning,
  };
}

function envUrls(...keys: string[]): string[] {
  return keys.flatMap((key) =>
    (process.env[key] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function normalizeUrlList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const entries = (Array.isArray(value) ? value : [value])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
  // Placeholder strings ("<your public sales CSV/JSON URL>") in env vars made
  // the hub report a source as configured while every fetch failed. Only
  // parseable http(s) URLs count; anything else is logged and dropped so the
  // hub falls back to an honest "setup required".
  const valid: string[] = [];
  for (const entry of entries) {
    try {
      const parsed = new URL(entry);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        valid.push(entry);
        continue;
      }
      throw new Error(`unsupported protocol ${parsed.protocol}`);
    } catch {
      log("warn", "provider.url.invalid", { entry: entry.slice(0, 120) });
    }
  }
  return valid;
}

function parseCsvRows(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  return lines.map((line) => {
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
  });
}

function parseCsv(text: string): OpenSaleRecord[] {
  const rows = parseCsvRows(text);
  if (rows.length < 1) return [];
  const headers = rows[0]!.map((header) => header.toLowerCase().trim());
  const hasHeader = headers.some((header) =>
    ["address", "property_address", "site_address", "street_address", "full_address", "sale_price", "price"].includes(
      header,
    ),
  );
  if (!hasHeader) return rows.map(hmlrRowToRecord).filter((record): record is OpenSaleRecord => record !== null);

  return rows.slice(1).map((cells) => {
    const out: Record<string, string> = {};
    headers.forEach((header, index) => {
      out[header] = cells[index] ?? "";
    });
    return out as unknown as OpenSaleRecord;
  });
}

function hmlrRowToRecord(cells: string[]): OpenSaleRecord | null {
  if (cells.length < 14) return null;
  const [transactionId, price, date, postcode, , , , paon, saon, street, locality, town, , county] = cells;
  const address = [saon, paon, street, locality, town, county, postcode]
    .filter((part) => part && part.trim() !== "")
    .join(" ");
  if (!address || !price) return null;
  return {
    address,
    sale_price: price,
    sale_date: date?.slice(0, 10),
    source: "HM Land Registry Price Paid Data",
    source_url: "https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads",
    url: transactionId ? `hmlr:${transactionId}` : undefined,
  };
}

function recordsFromJson(data: unknown): OpenPublicRecord[] {
  if (Array.isArray(data)) return data as OpenPublicRecord[];
  if (!data || typeof data !== "object") return [];
  const obj = data as {
    records?: unknown[];
    data?: unknown[];
    features?: ArcGisFeature[];
  };
  if (Array.isArray(obj.records)) return obj.records as OpenPublicRecord[];
  if (Array.isArray(obj.data)) return obj.data as OpenPublicRecord[];
  if (Array.isArray(obj.features)) {
    return obj.features.map((feature) => ({
      ...(feature.properties ?? {}),
      ...(feature.attributes ?? {}),
    }));
  }
  return [];
}

async function loadOpenRecords(url: string): Promise<OpenPublicRecord[]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Forleads/1.0 (open-data real-estate CRM; +https://forleads.vercel.app)",
      Accept: "application/json,text/csv;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) return [];
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("json") || url.endsWith(".json")) {
    return recordsFromJson(await res.json());
  }
  return parseCsv(await res.text()) as OpenPublicRecord[];
}

async function loadOpenSaleRecords(url: string): Promise<OpenSaleRecord[]> {
  return (await loadOpenRecords(url)) as OpenSaleRecord[];
}

function priceFrom(record: OpenSaleRecord): string | undefined {
  return record.sale_price ?? record.price ?? record.amount;
}

function dateFrom(record: OpenSaleRecord): string | undefined {
  return record.sale_date ?? record.date;
}

function validPastDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.slice(0, 10);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (parsed.getTime() > todayUtc.getTime()) return undefined;
  return normalized;
}

function validPrice(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/[^0-9.]/g, "");
  const amount = Number(digits);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return value.trim();
}

function saleRecordUsable(record: OpenSaleRecord): boolean {
  return Boolean(validPrice(priceFrom(record)) && validPastDate(dateFrom(record)));
}

function sourceFrom(record: OpenSaleRecord, fallbackUrl: string) {
  return {
    name: record.source || "Open sales record",
    url: safeSourceUrl(record.source_url ?? record.url, fallbackUrl),
    as_of: validPastDate(dateFrom(record)),
  };
}

function publicRecordDate(record: PublicRecordBag): string | undefined {
  return validPastDate(
    firstString(record, [
      "as_of",
      "as_of_date",
      "updated_at",
      "last_updated",
      "record_date",
      "date",
      "sale_date",
    ]),
  );
}

function publicRecordSource(record: PublicRecordBag, fallbackUrl: string) {
  return {
    name: firstString(record, ["source", "agency", "jurisdiction", "county"]) ?? "Open property record",
    url: safeSourceUrl(firstString(record, ["source_url", "url", "record_url"]), fallbackUrl),
    as_of: publicRecordDate(record),
  };
}

function safeSourceUrl(candidate: string | undefined, fallbackUrl: string): string {
  if (!candidate) return fallbackUrl;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fallbackUrl;
    return parsed.toString();
  } catch {
    return fallbackUrl;
  }
}

function safeMediaUrl(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  const trimmed = candidate.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function recordAddress(record: OpenPublicRecord): string | undefined {
  if (record.address) return record.address;
  if (record.property_address) return record.property_address;
  if (record.site_address) return record.site_address;
  if (record.street_address) return record.street_address;
  if (record.full_address) return record.full_address;
  const location = record.location;
  if (typeof location === "string") return location;
  if (!location || typeof location !== "object") return undefined;
  if (location.address) return location.address;
  if (location.human_address) {
    try {
      const parsed = JSON.parse(location.human_address) as { address?: string };
      return parsed.address;
    } catch {
      return location.human_address;
    }
  }
  return undefined;
}

function addressMatches(record: OpenPublicRecord, targetAddress: string): boolean {
  const source = recordAddress(record);
  return source ? addressesMatch(source, targetAddress) : false;
}

function coordFrom(record: PublicRecordBag, keys: string[]): number | undefined {
  const raw = firstString(record, keys);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const earth = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function mediaRecordMatches(record: OperatorMediaRecord, input: PropertyQuery): boolean {
  if (addressMatches(record, input.address)) return true;
  const lat = coordFrom(record, ["lat", "latitude", "y"]);
  const lng = coordFrom(record, ["lng", "lon", "longitude", "x"]);
  if (lat === undefined || lng === undefined) return false;
  return distanceMeters({ lat, lng }, { lat: input.lat, lng: input.lng }) <= 75;
}

function mediaRights(record: OperatorMediaRecord): string | undefined {
  return firstString(record, ["rights", "license", "usage_rights", "permission"]);
}

function mediaUrlFrom(record: OperatorMediaRecord): string | undefined {
  return safeMediaUrl(firstString(record, ["image_url", "photo_url", "media_url", "thumbnail_url", "image", "url"]));
}

function mediaCapturedAt(record: OperatorMediaRecord): string | undefined {
  return publicRecordDate(record) ?? validPastDate(firstString(record, ["captured_at", "captured_date"]));
}

function propertyCardsFromRecord(record: PublicRecordBag, fallbackUrl: string): EvidenceCard[] {
  const source = publicRecordSource(record, fallbackUrl);
  const cards: EvidenceCard[] = [];
  const add = (claim: string, keys: string[], suffix = "") => {
    const value = firstString(record, keys);
    if (!value) return;
    cards.push({
      scout: "property",
      claim,
      value: `${value}${suffix}`,
      sources: [source],
      confidence: "B",
      reasoning:
        "Matched an operator-configured public assessor/property record by address. Verify locally before using for legal or valuation decisions.",
    });
  };

  add("Year built", ["year_built", "yr_built", "built_year", "build_year", "effective_year_built"]);
  add("Building area", ["building_area", "building_sqft", "living_area", "living_sqft", "gross_area", "bldg_sqft"], " sq ft");
  add("Land area", ["land_area", "lot_area", "lot_sqft", "land_sqft", "parcel_area"], " sq ft");
  add("Property use", ["property_use", "land_use", "use_code", "zoning_use", "property_type"]);
  add("Assessor parcel id", ["parcel_id", "apn", "pin", "tax_id", "account_number"]);
  return cards;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return undefined;
}

// ---- Public Nominatim (zero self-hosting; ~1 req/sec fair-use) --------------
// For solo testing and small workloads. For scale, switch to PhotonNominatim
// pointed at self-hosted endpoints (FORLEADS_GEOCODER=photon-nominatim).

export class PublicNominatimGeocodeProvider implements GeocodeProvider {
  readonly name = "nominatim";
  readonly mode = "live" as const;
  // Default to the OSM-hosted Nominatim. Fair-use requires a real User-Agent +
  // capping QPS — fine for one human typing in a search box.
  constructor(private baseUrl = "https://nominatim.openstreetmap.org") {}

  async autocomplete(query: string, limit = 6): Promise<GeoResult[]> {
    const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&format=jsonv2&addressdetails=1&limit=${limit}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Forleads/1.0 (real-estate CRM; +https://forleads.vercel.app)",
        "Accept-Language": "en",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      lon: string;
      lat: string;
      display_name: string;
      address?: Record<string, string>;
    }>;
    const results = data.map((r) => {
      const a = r.address ?? {};
      const headline =
        [a.house_number, a.road].filter(Boolean).join(" ") ||
        r.display_name.split(",")[0] ||
        r.display_name;
      const locality = [a.city ?? a.town ?? a.village, a.state, a.country]
        .filter(Boolean)
        .join(", ");
      return {
        address: headline,
        locality,
        lng: parseFloat(r.lon),
        lat: parseFloat(r.lat),
      };
    });
    return Array.from(
      new Map(
        results.map((result) => [
          [
            result.address.toLowerCase(),
            result.locality?.toLowerCase() ?? "",
            result.lng.toFixed(6),
            result.lat.toFixed(6),
          ].join("|"),
          result,
        ]),
      ).values(),
    );
  }

  async reverse(lng: number, lat: number): Promise<GeoResult | null> {
    const url = `${this.baseUrl}/reverse?lon=${lng}&lat=${lat}&format=jsonv2`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Forleads/1.0 (real-estate CRM; +https://forleads.vercel.app)",
        "Accept-Language": "en",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string; address?: Record<string, string> };
    if (!data.display_name) return null;
    return {
      address: data.display_name.split(",").slice(0, 2).join(",").trim(),
      locality: data.address?.city ?? data.address?.town,
      lng,
      lat,
    };
  }
}

// ---- Photon + Nominatim geocoding (self-hosted) -----------------------------

export class PhotonNominatimGeocodeProvider implements GeocodeProvider {
  readonly name = "photon-nominatim";
  readonly mode = "live" as const;
  constructor(
    private photonUrl: string,
    private nominatimUrl: string
  ) {}

  async autocomplete(query: string, limit = 6): Promise<GeoResult[]> {
    const url = `${this.photonUrl}/api?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url, { headers: { "User-Agent": "Forleads/1.0" } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[];
    };
    return (data.features ?? []).map((f) => {
      const p = f.properties;
      const parts = [p.name, p.street, p.city, p.country].filter(Boolean);
      return {
        address: p.name ?? parts[0] ?? "Unknown",
        locality: [p.city, p.country].filter(Boolean).join(", "),
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      };
    });
  }

  async reverse(lng: number, lat: number): Promise<GeoResult | null> {
    const url = `${this.nominatimUrl}/reverse?lon=${lng}&lat=${lat}&format=jsonv2`;
    const res = await fetch(url, { headers: { "User-Agent": "Forleads/1.0" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string; address?: Record<string, string> };
    if (!data.display_name) return null;
    return {
      address: data.display_name.split(",").slice(0, 2).join(",").trim(),
      locality: data.address?.city ?? data.address?.town,
      lng,
      lat,
    };
  }
}

// ---- OSM Overpass property facts --------------------------------------------

export class OSMPropertyProvider implements PropertyDataProvider {
  readonly name = "osm";
  readonly mode = "live" as const;
  constructor(private overpassUrl = "https://overpass-api.de/api/interpreter") {}

  async hasCoverage(): Promise<boolean> {
    return true; // OSM is the global floor.
  }

  async facts(q: PropertyQuery): Promise<EvidenceCard[]> {
    const problem = queryProblem(q);
    if (problem) return [gapCard("property", "Building facts", problem)];

    const radius = 40;
    const query = `[out:json][timeout:8];(way(around:${radius},${q.lat},${q.lng})["building"];);out tags center 1;`;
    try {
      const res = await fetch(this.overpassUrl, {
        method: "POST",
        body: query,
        // Overpass + most OSM endpoints 406/429 requests without a descriptive
        // User-Agent (their fair-use policy). Verified: omitting this fails live.
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": "Forleads/1.0 (real-estate CRM; +https://forleads.vercel.app)",
        },
      });
      if (!res.ok) return this.gap("Overpass request failed");
      const data = (await res.json()) as {
        elements?: { tags?: Record<string, string> }[];
      };
      const el = data.elements?.[0];
      const tags = el?.tags ?? {};
      const cards: EvidenceCard[] = [];
      if (tags["start_date"] || tags["building:year"]) {
        cards.push({
          scout: "property",
          claim: "Year built",
          value: `~${tags["start_date"] ?? tags["building:year"]}`,
          sources: [{ name: "OpenStreetMap", url: "https://openstreetmap.org" }],
          confidence: "A",
        });
      }
      if (tags["building"]) {
        cards.push({
          scout: "property",
          claim: "Land use",
          value: tags["building"] === "yes" ? "Building (untyped)" : tags["building"],
          sources: [{ name: "OSM" }],
          confidence: tags["building"] === "yes" ? "C" : "A",
        });
      }
      if (cards.length === 0) return this.gap("No building tags found at this point");
      return cards;
    } catch {
      return this.gap("Network error reaching OSM");
    }
  }

  async comps(): Promise<EvidenceCard[]> {
    return [
      {
        scout: "market",
        claim: "Resale estimate",
        value: null,
        sources: [],
        confidence: "D",
        reasoning:
          "Public map data doesn't include sale prices. Once public sale records cover this market, comps appear here automatically.",
      },
    ];
  }

  private gap(reason: string): EvidenceCard[] {
    return [
      {
        scout: "property",
        claim: "Building facts",
        value: null,
        sources: [],
        confidence: "D",
        reasoning: reason,
      },
    ];
  }
}

// ---- Open public sales / assessor feed -------------------------------------

export class OpenDataPropertyProvider implements PropertyDataProvider {
  readonly name = "open-data";
  readonly mode = "live" as const;
  private readonly salesUrls: string[];
  private readonly propertyUrls: string[];

  constructor(
    private readonly base: PropertyDataProvider = new OSMPropertyProvider(process.env.OVERPASS_URL),
    salesUrls: string | string[] | undefined = envUrls(
      "OPEN_SALES_DATA_URL",
      "OPEN_SALES_DATA_URLS",
      "COUNTY_OPEN_DATA_URL",
      "US_OPEN_SALES_DATA_URL",
      "HMLR_PRICE_PAID_URL",
      "UK_PRICE_PAID_DATA_URL",
      "ENGLAND_PRICE_PAID_DATA_URL",
      "EU_OPEN_SALES_DATA_URL",
      "EU_CADASTRE_DATA_URL",
      "AFRICA_OPEN_SALES_DATA_URL",
      "OPERATOR_SALES_IMPORT_URL",
    ),
    propertyUrls: string | string[] | undefined = envUrls(
      "COUNTY_ASSESSOR_DATA_URL",
      "COUNTY_PROPERTY_DATA_URL",
      "OPERATOR_PROPERTY_IMPORT_URL",
      "OPEN_PROPERTY_DATA_URL",
    ),
  ) {
    this.salesUrls = normalizeUrlList(salesUrls);
    this.propertyUrls = normalizeUrlList(propertyUrls);
  }

  async hasCoverage(lng: number, lat: number): Promise<boolean> {
    return this.salesUrls.length > 0 || this.propertyUrls.length > 0 || catalogCovers(lng, lat, ["sales", "assessment"]);
  }

  async facts(input: PropertyQuery): Promise<EvidenceCard[]> {
    const baseCards = await this.base.facts(input);
    const problem = queryProblem(input, { requireAddress: true });
    if (problem || this.propertyUrls.length === 0) return baseCards;

    try {
      const loaded = await Promise.all(
        this.propertyUrls.map(async (url) => ({
          url,
          records: await loadOpenRecords(url),
        })),
      );
      const matches = loaded.flatMap(({ url, records }) =>
        records
          .filter((record) => addressMatches(record, input.address))
          .map((record) => ({ url, record: record as PublicRecordBag })),
      );
      if (matches.length === 0) return baseCards;

      const cards = matches.flatMap(({ url, record }) => propertyCardsFromRecord(record, url));
      return cards.length > 0 ? [...baseCards, ...cards] : baseCards;
    } catch (e) {
      log("warn", "provider.property.failed", {
        error: e instanceof Error ? e.message : String(e),
        urls: this.propertyUrls.length,
      });
      return [
        ...baseCards,
        gapCard(
          "property",
          "Open property records",
          "Public assessor/property records weren't reachable just now — they'll load on the next look.",
        ),
      ];
    }
  }

  async comps(input: PropertyQuery): Promise<EvidenceCard[]> {
    const problem = queryProblem(input, { requireAddress: true });
    if (problem) return [gapCard("market", "Open sale records", problem)];

    const covered = this.salesUrls.length > 0 || catalogCovers(input.lng, input.lat, ["sales", "assessment"]);
    if (!covered) {
      return [
        {
          scout: "market",
          claim: "Open sale records",
          value: null,
          sources: [],
          confidence: "D",
          reasoning:
            "Public sale records don't cover this market yet. Forleads shows a verified gap instead of a guessed price.",
        },
      ];
    }

    const [envState, catalogMatches] = await Promise.all([
      this.envSaleMatches(input),
      queryCatalogSales(input).catch((e) => {
        log("warn", "provider.catalog.sales.failed", { error: e instanceof Error ? e.message : String(e) });
        return [] as CatalogMatch[];
      }),
    ]);

    const cards: EvidenceCard[] = [];
    const saleMatches = [
      ...envState.usable.map((m) => ({
        amount: priceFrom(m.record),
        date: dateFrom(m.record),
        source: sourceFrom(m.record, m.url),
      })),
      ...catalogMatches
        .filter((m) => m.source.kind === "sales")
        .map((m) => ({
          amount: m.amount,
          date: m.date,
          source: { name: m.source.name, url: m.source.homepage },
        })),
    ];
    if (saleMatches.length > 0) {
      const latest = saleMatches.slice().sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0]!;
      cards.push({
        scout: "market",
        claim: "Open sale record",
        value: latest.amount ? `${latest.amount}${latest.date ? ` on ${latest.date}` : ""}` : "record found",
        sources: [latest.source],
        confidence: saleMatches.length >= 3 ? "B" : "C",
        reasoning:
          saleMatches.length >= 3
            ? `${saleMatches.length} public sale record(s) matched this address.`
            : "Single public sale record matched this address; useful, but not enough for a modeled ARV.",
      });
    }

    const assessments = catalogMatches.filter((m) => m.source.kind === "assessment" && m.amount);
    if (assessments.length > 0) {
      const latest = assessments.slice().sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0]!;
      cards.push({
        scout: "market",
        claim: "Assessed value",
        value: `${latest.amount}${latest.date ? ` (${latest.date})` : ""}`,
        sources: [{ name: latest.source.name, url: latest.source.homepage }],
        confidence: "B",
        reasoning:
          "Official assessment register matched this address. Assessed value is a taxation figure, not a market price.",
      });
    }

    if (cards.length > 0) return cards;
    if (envState.unusableMatched) {
      return [
        {
          scout: "market",
          claim: "Open sale records",
          value: null,
          sources: [],
          confidence: "D",
          reasoning:
            "A matching public sale row was found, but it was missing a valid past sale date or positive sale price.",
        },
      ];
    }
    return [
      {
        scout: "market",
        claim: "Open sale records",
        value: null,
        sources: [],
        confidence: "D",
        reasoning: "No public sale or assessment record matches this address yet.",
      },
    ];
  }

  private async envSaleMatches(
    input: PropertyQuery,
  ): Promise<{ usable: { url: string; record: OpenSaleRecord }[]; unusableMatched: boolean }> {
    if (this.salesUrls.length === 0) return { usable: [], unusableMatched: false };
    try {
      const loaded = await Promise.all(
        this.salesUrls.map(async (url) => ({
          url,
          records: await loadOpenSaleRecords(url),
        })),
      );
      const rawMatches = loaded.flatMap(({ url, records }) =>
        records
          .filter((record) => addressMatches(record, input.address))
          .map((record) => ({ url, record })),
      );
      const usable = rawMatches.filter(({ record }) => saleRecordUsable(record));
      return { usable, unusableMatched: rawMatches.length > 0 && usable.length === 0 };
    } catch (e) {
      log("warn", "provider.sales.failed", {
        error: e instanceof Error ? e.message : String(e),
        urls: this.salesUrls.length,
      });
      return { usable: [], unusableMatched: false };
    }
  }
}

type LicensedProviderKind = "attom" | "rentcast" | "regrid" | "reportall" | "reso" | "mls-grid";

interface LicensedProviderSpec {
  label: string;
  env: string[];
  facts: string;
  comps: string;
}

const LICENSED_PROVIDER_SPECS: Record<LicensedProviderKind, LicensedProviderSpec> = {
  attom: {
    label: "ATTOM Property Data",
    env: ["ATTOM_API_KEY"],
    facts: "ATTOM property characteristics",
    comps: "ATTOM valuation/comparable-sales context",
  },
  rentcast: {
    label: "RentCast",
    env: ["RENTCAST_API_KEY"],
    facts: "RentCast property facts",
    comps: "RentCast sale/rent comps",
  },
  regrid: {
    label: "Regrid parcels",
    env: ["REGRID_API_KEY"],
    facts: "Regrid parcel facts",
    comps: "Regrid parcel context",
  },
  reportall: {
    label: "ReportAll parcels",
    env: ["REPORTALL_API_KEY"],
    facts: "ReportAll parcel facts",
    comps: "ReportAll parcel context",
  },
  reso: {
    label: "RESO Web API",
    env: ["RESO_WEB_API_URL", "RESO_ACCESS_TOKEN"],
    facts: "RESO listing/property facts",
    comps: "RESO listing and market context",
  },
  "mls-grid": {
    label: "MLS Grid",
    env: ["MLS_GRID_URL", "MLS_GRID_ACCESS_TOKEN"],
    facts: "MLS Grid listing/property facts",
    comps: "MLS Grid listing and market context",
  },
};

export class LicensedPropertyProvider implements PropertyDataProvider {
  readonly mode = "live" as const;
  readonly name: string;
  private readonly spec: LicensedProviderSpec;

  constructor(
    private readonly kind: LicensedProviderKind,
    private readonly base: PropertyDataProvider = new OpenDataPropertyProvider(),
  ) {
    this.name = kind;
    this.spec = LICENSED_PROVIDER_SPECS[kind];
  }

  async hasCoverage(lng: number, lat: number): Promise<boolean> {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
    return this.configured();
  }

  async facts(input: PropertyQuery): Promise<EvidenceCard[]> {
    const baseCards = await this.base.facts(input);
    return [...baseCards, this.gap("property", this.spec.facts)];
  }

  async comps(input: PropertyQuery): Promise<EvidenceCard[]> {
    const problem = queryProblem(input, { requireAddress: true });
    if (problem) return [gapCard("market", this.spec.comps, problem)];
    return [this.gap("market", this.spec.comps)];
  }

  private configured(): boolean {
    return this.spec.env.every((key) => {
      const value = process.env[key];
      return Boolean(value && value.trim() !== "");
    });
  }

  private gap(scout: EvidenceCard["scout"], claim: string): EvidenceCard {
    const setup = this.spec.env.join(" + ");
    return gapCard(
      scout,
      claim,
      this.configured()
        ? `${this.spec.label} credentials are configured, but this adapter still needs provider-specific response mapping before it can surface facts. Forleads reports the gap instead of guessing.`
        : `${this.spec.label} is not connected. Configure ${setup} before Forleads can use this licensed source.`,
    );
  }
}

// ---- Open hazard + distress feeds ------------------------------------------

export class OpenRiskDataProvider implements RiskDataProvider {
  readonly name = "open-risk";
  readonly mode = "live" as const;
  private readonly hazardUrls: string[];
  private readonly distressUrls: string[];

  constructor(
    hazardUrls: string | string[] | undefined = envUrls(
      "FEMA_NFHL_URL",
      "OPEN_HAZARD_LAYER_URL",
      "US_HAZARD_LAYER_URL",
      "UK_HAZARD_LAYER_URL",
      "EU_HAZARD_LAYER_URL",
      "AFRICA_HAZARD_LAYER_URL",
    ),
    distressUrls: string | string[] | undefined = envUrls(
      "OPEN_DISTRESS_DATA_URL",
      "OPEN_DISTRESS_DATA_URLS",
      "TAX_DELINQUENCY_DATA_URL",
      "CODE_VIOLATION_DATA_URL",
      "VACANT_REGISTRY_DATA_URL",
      "US_DISTRESS_DATA_URL",
      "UK_DISTRESS_DATA_URL",
      "EU_DISTRESS_DATA_URL",
      "AFRICA_DISTRESS_DATA_URL",
    ),
  ) {
    this.hazardUrls = normalizeUrlList(hazardUrls);
    this.distressUrls = normalizeUrlList(distressUrls);
  }

  async hazards(input: PropertyQuery): Promise<EvidenceCard[]> {
    const problem = queryProblem(input);
    if (problem) return [gapCard("risk", "Flood risk", problem)];

    const endpoints: { url: string; name?: string; homepage?: string }[] = [
      ...this.hazardUrls.map((url) => ({ url })),
      ...catalogHazardEndpoints(input.lng, input.lat),
    ];
    if (endpoints.length === 0) {
      return [
        {
          scout: "risk",
          claim: "Flood risk",
          value: null,
          sources: [],
          confidence: "D",
          reasoning:
            "No public hazard map covers this point yet. Forleads reports the gap rather than guessing risk.",
        },
      ];
    }

    const empty: EvidenceCard[] = [];
    for (const endpoint of endpoints) {
      const cards = await this.hazardFromUrl(endpoint.url, input, endpoint.name, endpoint.homepage);
      const grounded = cards.find(
        (card) => card.confidence !== "D" && !String(card.value).startsWith("No mapped"),
      );
      if (grounded) return cards;
      if (cards.length > 0 && empty.length === 0) empty.push(...cards);
    }
    return empty.length > 0
      ? empty
      : [
          {
            scout: "risk",
            claim: "Flood risk",
            value: null,
            sources: [],
            confidence: "D",
            reasoning: "Public hazard maps weren't reachable just now — they'll load on the next look.",
          },
        ];
  }

  async distress(input: PropertyQuery): Promise<EvidenceCard[]> {
    const problem = queryProblem(input, { requireAddress: true });
    if (problem) return [gapCard("risk", "Open distress signals", problem)];

    const covered = this.distressUrls.length > 0 || catalogCovers(input.lng, input.lat, ["distress"]);
    if (!covered) {
      return [
        {
          scout: "risk",
          claim: "Open distress signals",
          value: null,
          sources: [],
          confidence: "D",
          reasoning:
            "Public distress records (tax delinquency, code violations, vacancy) don't cover this area yet.",
        },
      ];
    }

    const [envMatches, catalogMatches] = await Promise.all([
      this.envDistressMatches(input),
      queryCatalogDistress(input).catch((e) => {
        log("warn", "provider.catalog.distress.failed", { error: e instanceof Error ? e.message : String(e) });
        return [] as CatalogMatch[];
      }),
    ]);

    const merged = [
      ...envMatches.map(({ url, record }) => ({
        label:
          record.record_type ??
          record.violation_type ??
          record.case_type ??
          record.category ??
          record.type ??
          record.status ??
          "public distress record",
        date: record.date ?? record.created_date ?? record.inspection_date,
        source: { name: record.source || "Open county data", url: record.source_url ?? record.url ?? url },
      })),
      ...catalogMatches.map((m) => ({
        label: m.label ?? "public distress record",
        date: m.date,
        source: { name: m.source.name, url: m.source.homepage },
      })),
    ];

    if (merged.length === 0) {
      return [
        {
          scout: "risk",
          claim: "Open distress signals",
          value: null,
          sources: [],
          confidence: "D",
          reasoning: "No public distress record matches this address — a quiet signal, honestly reported.",
        },
      ];
    }

    const latest = merged.slice().sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0]!;
    return [
      {
        scout: "risk",
        claim: "Open distress signal",
        value: `${latest.label}${latest.date ? ` · ${latest.date}` : ""}`,
        sources: [latest.source],
        confidence: merged.length >= 2 ? "B" : "C",
        reasoning:
          merged.length >= 2
            ? `${merged.length} public distress record(s) matched this address.`
            : "Single public distress record matched this address; verify before prioritizing outreach.",
      },
    ];
  }

  private async envDistressMatches(
    input: PropertyQuery,
  ): Promise<{ url: string; record: OpenPublicRecord }[]> {
    if (this.distressUrls.length === 0) return [];
    try {
      const loaded = await Promise.all(
        this.distressUrls.map(async (url) => ({
          url,
          records: await loadOpenRecords(url),
        })),
      );
      return loaded.flatMap(({ url, records }) =>
        records
          .filter((record) => addressMatches(record, input.address))
          .map((record) => ({ url, record })),
      );
    } catch (e) {
      log("warn", "provider.distress.failed", {
        error: e instanceof Error ? e.message : String(e),
        urls: this.distressUrls.length,
      });
      return [];
    }
  }

  private async hazardFromUrl(
    rawHazardUrl: string,
    input: PropertyQuery,
    knownName?: string,
    knownHomepage?: string,
  ): Promise<EvidenceCard[]> {
    try {
      const queryUrl = await this.arcGisQueryUrl(rawHazardUrl);
      if (!queryUrl) {
        return [
          {
            scout: "risk",
            claim: "Flood risk",
            value: null,
            sources: [],
            confidence: "D",
            reasoning: "This hazard map source can't be queried at a single point — reported as a gap, not a guess.",
          },
        ];
      }
      const url = new URL(queryUrl);
      url.searchParams.set("f", "json");
      url.searchParams.set("geometry", `${input.lng},${input.lat}`);
      url.searchParams.set("geometryType", "esriGeometryPoint");
      url.searchParams.set("inSR", "4326");
      url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
      url.searchParams.set("outFields", "*");
      url.searchParams.set("returnGeometry", "false");

      const res = await fetch(url, {
        headers: {
          "User-Agent": "Forleads/1.0 (open hazard scout; +https://forleads.vercel.app)",
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error(`hazard ${res.status}`);
      const data = (await res.json()) as { features?: ArcGisFeature[] };
      const features = data.features ?? [];
      if (features.length === 0) {
        return [
          {
            scout: "risk",
            claim: "Flood risk",
            value: "No mapped open hazard zone at this point",
            sources: [{ name: knownName ?? sourceNameForHazard(rawHazardUrl), url: knownHomepage ?? rawHazardUrl }],
            confidence: "C",
            reasoning:
              "Point query returned no intersecting hazard polygon. Confirm locally before treating this as insurance guidance.",
          },
        ];
      }

      const attrs = features[0]?.attributes ?? features[0]?.properties ?? {};
      const zone =
        firstString(attrs, ["FLD_ZONE", "fld_zone", "ZONE", "zone", "hazard", "HAZARD", "name", "NAME"]) ??
        "mapped zone";
      const subtype = firstString(attrs, ["ZONE_SUBTY", "zone_subty", "SFHA_TF", "sfha_tf", "description", "DESC"]);
      const sourceName = knownName ?? sourceNameForHazard(rawHazardUrl);
      return [
        {
          scout: "risk",
          claim: "Flood risk",
          value: subtype ? `${sourceName} ${zone} · ${subtype}` : `${sourceName} ${zone}`,
          sources: [{ name: sourceName, url: knownHomepage ?? rawHazardUrl }],
          confidence: "B",
          reasoning:
            "Open hazard point query intersected a mapped feature. This is public hazard context, not a replacement for local due diligence.",
        },
      ];
    } catch {
      return [];
    }
  }

  private async arcGisQueryUrl(rawUrl: string): Promise<string | null> {
    if (/\/query(?:\?|$)/i.test(rawUrl)) return rawUrl;
    const clean = rawUrl.replace(/\/+$/, "");
    if (/\/MapServer\/\d+$/i.test(clean)) return `${clean}/query`;
    if (!/\/MapServer$/i.test(clean)) return `${clean}/query`;

    try {
      const meta = await fetch(`${clean}?f=json`, {
        headers: {
          "User-Agent": "Forleads/1.0 (open hazard scout; +https://forleads.vercel.app)",
          Accept: "application/json",
        },
      });
      if (!meta.ok) return `${clean}/28/query`;
      const data = (await meta.json()) as { layers?: { id: number; name?: string }[] };
      const layer = (data.layers ?? []).find((candidate) =>
        /s_fld_haz_ar|flood hazard|flood zones?/i.test(candidate.name ?? ""),
      );
      return `${clean}/${layer?.id ?? 28}/query`;
    } catch {
      return `${clean}/28/query`;
    }
  }
}

function sourceNameForHazard(url: string): string {
  if (/fema|nfhl/i.test(url)) return "FEMA NFHL";
  if (/environment-agency|data\.gov\.uk|flood/i.test(url)) return "Open flood layer";
  if (/europa|inspire/i.test(url)) return "EU open hazard layer";
  if (/africa/i.test(url)) return "Africa open hazard layer";
  return "Open hazard layer";
}

// ---- Operator-owned property media -----------------------------------------

export class NoStreetImageryProvider implements ImageryProvider {
  readonly name = "no-street-imagery";
  readonly mode = "live" as const;

  async street(q: PropertyQuery): Promise<EvidenceCard[]> {
    const problem = queryProblem(q);
    if (problem) return [gapCard("imagery", "Street imagery", problem)];
    return [
      gapCard(
        "imagery",
        "Street imagery",
        "No live street-imagery provider is configured. Add Mapillary, Google Street View, or operator-owned media before relying on property photos.",
      ),
    ];
  }

  aerialAttribution(): string {
    return "No live street imagery configured";
  }
}

export class OperatorPropertyMediaProvider implements ImageryProvider {
  readonly name = "operator-property-media";
  readonly mode = "live" as const;
  private readonly manifestUrls: string[];

  constructor(
    private readonly base: ImageryProvider = new NoStreetImageryProvider(),
    manifestUrls: string | string[] | undefined = envUrls(
      "OPERATOR_PROPERTY_MEDIA_URL",
      "FIELD_PHOTO_MANIFEST_URL",
      "NEXT_PUBLIC_FIELD_PHOTOS",
    ),
  ) {
    this.manifestUrls = normalizeUrlList(manifestUrls);
  }

  async street(q: PropertyQuery): Promise<EvidenceCard[]> {
    const problem = queryProblem(q, { requireAddress: true });
    if (problem) return [gapCard("imagery", "Agent-captured property photos", problem)];

    const baseCards = await this.base.street(q);
    if (this.manifestUrls.length === 0) return baseCards;

    try {
      const loaded = await Promise.all(
        this.manifestUrls.map(async (url) => ({
          url,
          records: (await loadOpenRecords(url)) as OperatorMediaRecord[],
        })),
      );
      const matches = loaded.flatMap(({ url, records }) =>
        records
          .filter((record) => mediaRecordMatches(record, q))
          .map((record) => ({ url, record })),
      );
      const valid = matches
        .map(({ url, record }) => ({
          url,
          record,
          mediaUrl: mediaUrlFrom(record),
          rights: mediaRights(record),
        }))
        .filter(
          (match): match is { url: string; record: OperatorMediaRecord; mediaUrl: string; rights: string } =>
            Boolean(match.mediaUrl && match.rights),
        );

      if (valid.length === 0) {
        return [this.gap("No operator-owned or licensed property photo matched this address yet."), ...baseCards];
      }

      const sorted = valid
        .slice()
        .sort((a, b) => (mediaCapturedAt(b.record) ?? "").localeCompare(mediaCapturedAt(a.record) ?? ""));
      const latest = mediaCapturedAt(sorted[0]!.record);
      return [
        {
          scout: "imagery",
          claim: "Agent-captured property photos",
          value: `${valid.length} photo${valid.length === 1 ? "" : "s"}`,
          sources: [
            {
              name: firstString(sorted[0]!.record, ["source", "provider", "photographer"]) ?? "Operator property media",
              url: safeSourceUrl(firstString(sorted[0]!.record, ["source_url", "record_url"]), sorted[0]!.url),
              as_of: latest,
            },
          ],
          confidence: "A",
          media: sorted.slice(0, 6).map(({ record, mediaUrl }, index) => ({
            kind: "image" as const,
            url: mediaUrl,
            alt:
              firstString(record, ["alt", "caption", "description"]) ??
              `Agent-provided property photo ${index + 1} near ${q.address}`,
            source: firstString(record, ["source", "provider", "photographer"]) ?? "Operator property media",
            captured_at: mediaCapturedAt(record),
            attribution:
              firstString(record, ["attribution", "credit"]) ??
              `${mediaRights(record) ?? "Operator-provided media"}`,
          })),
          reasoning:
            "Matched configured operator-owned or licensed media by address or nearby coordinates. Treat photos as visual context and verify condition before advising a client.",
        },
        ...baseCards,
      ];
    } catch (e) {
      log("warn", "provider.operator_media.failed", {
        error: e instanceof Error ? e.message : String(e),
        urls: this.manifestUrls.length,
      });
      return [
        this.gap("Configured operator media was not reachable just now; Forleads kept other imagery sources and reported the gap."),
        ...baseCards,
      ];
    }
  }

  aerialAttribution(): string {
    return `${this.base.aerialAttribution()} · Operator media © rights holder`;
  }

  private gap(reasoning: string): EvidenceCard {
    return gapCard("imagery", "Agent-captured property photos", reasoning);
  }
}

// ---- Mapillary imagery ------------------------------------------------------

export class MapillaryImageryProvider implements ImageryProvider {
  readonly name = "mapillary";
  readonly mode = "live" as const;
  constructor(private token: string) {}

  async street(q: PropertyQuery): Promise<EvidenceCard[]> {
    const problem = queryProblem(q);
    if (problem) return [gapCard("imagery", "Street imagery", problem)];

    const bbox = [q.lng - 0.0006, q.lat - 0.0006, q.lng + 0.0006, q.lat + 0.0006].join(",");
    const url = `https://graph.mapillary.com/images?access_token=${this.token}&fields=id,thumb_1024_url,captured_at&bbox=${bbox}&limit=5`;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Forleads/1.0 (street-imagery scout; +https://forleads.vercel.app)",
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        return [
          {
            scout: "imagery",
            claim: "Street imagery",
            value: null,
            sources: [],
            confidence: "D",
            reasoning: "No Mapillary coverage here yet — be the first to add it.",
          },
        ];
      }
      const data = (await res.json()) as { data?: MapillaryImage[] };
      const images = data.data ?? [];
      const n = images.length;
      if (n === 0) {
        return [
          {
            scout: "imagery",
            claim: "Street imagery",
            value: null,
            sources: [],
            confidence: "D",
            reasoning: "No Mapillary coverage here yet — aerial only.",
          },
        ];
      }
      const datedImages = images.filter((image) => image.captured_at);
      const latestCapture = datedImages
        .slice()
        .sort((a, b) => String(b.captured_at).localeCompare(String(a.captured_at)))[0]?.captured_at;
      const firstImage = images[0]!;
      return [
        {
          scout: "imagery",
          claim: "Street imagery",
          value: `${n} frame${n > 1 ? "s" : ""}`,
          sources: [
            {
              name: "Mapillary",
              url: `https://www.mapillary.com/app/?pKey=${encodeURIComponent(firstImage.id)}`,
              as_of: latestCapture?.slice(0, 10),
            },
            { name: "CC-BY-SA" },
          ],
          confidence: "A",
          media: images
            .filter((image) => image.thumb_1024_url)
            .slice(0, 3)
            .map((image, index) => ({
              kind: "image" as const,
              url: image.thumb_1024_url!,
              alt: `Street-level property imagery frame ${index + 1}`,
              source: "Mapillary",
              captured_at: image.captured_at?.slice(0, 10),
              attribution: "© Mapillary contributors, CC-BY-SA",
            })),
          reasoning:
            latestCapture
              ? `Nearest Mapillary frame captured ${latestCapture.slice(0, 10)}. Coverage is community-driven and may not show the current condition.`
              : "Nearest Mapillary frames found. Coverage is community-driven and may not show the current condition.",
        },
      ];
    } catch {
      return [
        {
          scout: "imagery",
          claim: "Street imagery",
          value: null,
          sources: [],
          confidence: "D",
          reasoning: "Network error reaching Mapillary.",
        },
      ];
    }
  }

  aerialAttribution(): string {
    return "Imagery © Esri";
  }
}

// ---- Google Street View imagery --------------------------------------------

export class GoogleStreetViewImageryProvider implements ImageryProvider {
  readonly name = "google-street-view";
  readonly mode = "live" as const;

  constructor(private apiKey: string) {}

  async street(q: PropertyQuery): Promise<EvidenceCard[]> {
    const problem = queryProblem(q);
    if (problem) return [gapCard("imagery", "Street imagery", problem)];

    const metadataUrl = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
    metadataUrl.searchParams.set("location", `${q.lat},${q.lng}`);
    metadataUrl.searchParams.set("radius", "50");
    metadataUrl.searchParams.set("source", "outdoor");
    metadataUrl.searchParams.set("key", this.apiKey);

    try {
      const res = await fetch(metadataUrl, {
        headers: {
          "User-Agent": "Forleads/1.0 (street-view imagery scout; +https://forleads.vercel.app)",
          Accept: "application/json",
        },
      });
      if (!res.ok) return [this.gap("Google Street View metadata was not reachable.")];

      const metadata = (await res.json()) as GoogleStreetViewMetadata;
      if (metadata.status !== "OK") {
        return [this.gap(`Google Street View returned ${metadata.status ?? "no result"} for this point.`)];
      }

      const mediaUrl = `/api/imagery/google-street-view?lat=${encodeURIComponent(String(q.lat))}&lng=${encodeURIComponent(String(q.lng))}`;
      return [
        {
          scout: "imagery",
          claim: "Street imagery",
          value: metadata.date ? `Google Street View · ${metadata.date}` : "Google Street View frame",
          sources: [
            {
              name: "Google Street View",
              url: "https://developers.google.com/maps/documentation/streetview/overview",
              as_of: metadata.date,
            },
          ],
          confidence: "A",
          media: [
            {
              kind: "image",
              url: mediaUrl,
              alt: `Google Street View image near ${q.address}`,
              source: "Google Street View",
              captured_at: metadata.date,
              attribution: metadata.copyright ?? "© Google",
            },
          ],
          reasoning:
            "Google metadata confirmed street-view imagery near this point. Treat it as visual context, not proof of current property condition.",
        },
      ];
    } catch {
      return [this.gap("Network error reaching Google Street View.")];
    }
  }

  aerialAttribution(): string {
    return "Street imagery © Google";
  }

  private gap(reasoning: string): EvidenceCard {
    return gapCard("imagery", "Street imagery", reasoning);
  }
}
