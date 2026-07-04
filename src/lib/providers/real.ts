// ============================================================================
// Real provider adapters. Same typed contracts as the mocks; activated by env.
// These make real network calls and STILL enforce the EvidenceCard contract —
// any claim without a source becomes a grade-D gap, never a naked number.
// ============================================================================

import type { EvidenceCard } from "@/lib/core/types";
import { log } from "@/lib/observability";
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

interface ArcGisFeature {
  attributes?: Record<string, unknown>;
  properties?: Record<string, unknown>;
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
  return (Array.isArray(value) ? value : [value])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeAddress(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(road)\b/g, "rd")
    .replace(/\b(street)\b/g, "st")
    .replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(drive)\b/g, "dr")
    .replace(/\b(lane)\b/g, "ln")
    .trim();
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

function sourceFrom(record: OpenSaleRecord, fallbackUrl: string) {
  return {
    name: record.source || "Open sales record",
    url: record.source_url ?? record.url ?? fallbackUrl,
  };
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
  if (!source) return false;
  const target = normalizeAddress(targetAddress);
  const candidate = normalizeAddress(source);
  if (candidate === target) return true;

  const targetTokens = target.split(" ");
  const candidateTokens = candidate.split(" ");
  if (targetTokens.length < 3 || candidateTokens.length < 3) return false;
  if (targetTokens[0] !== candidateTokens[0]) return false;
  const targetStreet = targetTokens.slice(1);
  const candidateStreet = candidateTokens.slice(1);
  const shared = Math.min(targetStreet.length, candidateStreet.length);
  if (shared < 2) return false;
  if (targetStreet.slice(0, 2).join(" ") === candidateStreet.slice(0, 2).join(" ")) return true;
  return targetStreet.slice(0, shared).join(" ") === candidateStreet.slice(0, shared).join(" ");
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

  constructor(
    private readonly base = new OSMPropertyProvider(process.env.OVERPASS_URL),
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
  ) {
    this.salesUrls = normalizeUrlList(salesUrls);
  }

  async hasCoverage(): Promise<boolean> {
    return this.salesUrls.length > 0;
  }

  facts(input: PropertyQuery): Promise<EvidenceCard[]> {
    return this.base.facts(input);
  }

  async comps(input: PropertyQuery): Promise<EvidenceCard[]> {
    if (this.salesUrls.length === 0) {
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

    try {
      const loaded = await Promise.all(
        this.salesUrls.map(async (url) => ({
          url,
          records: await loadOpenSaleRecords(url),
        })),
      );
      const matches = loaded.flatMap(({ url, records }) =>
        records
          .filter((record) => addressMatches(record, input.address))
          .map((record) => ({ url, record })),
      );
      if (matches.length === 0) {
        return [
          {
            scout: "market",
            claim: "Open sale records",
            value: null,
            sources: [],
            confidence: "D",
            reasoning: "No public sale record matches this address yet.",
          },
        ];
      }

      const latest = matches
        .slice()
        .sort((a, b) => (dateFrom(b.record) ?? "").localeCompare(dateFrom(a.record) ?? ""))[0]!;
      const price = priceFrom(latest.record);
      return [
        {
          scout: "market",
          claim: "Open sale record",
          value: price ? `${price}${dateFrom(latest.record) ? ` on ${dateFrom(latest.record)}` : ""}` : "record found",
          sources: [sourceFrom(latest.record, latest.url)],
          confidence: matches.length >= 3 ? "B" : "C",
          reasoning:
            matches.length >= 3
              ? `${matches.length} public sale record(s) matched this address.`
              : "Single public sale record matched this address; useful, but not enough for a modeled ARV.",
        },
      ];
    } catch (e) {
      log("warn", "provider.sales.failed", {
        error: e instanceof Error ? e.message : String(e),
        urls: this.salesUrls.length,
      });
      return [
        {
          scout: "market",
          claim: "Open sale records",
          value: null,
          sources: [],
          confidence: "D",
          reasoning: "Public sale records weren't reachable just now — they'll load on the next look.",
        },
      ];
    }
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
    if (this.hazardUrls.length === 0) {
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
    for (const hazardUrl of this.hazardUrls) {
      const cards = await this.hazardFromUrl(hazardUrl, input);
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
    if (this.distressUrls.length === 0) {
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

    try {
      const loaded = await Promise.all(
        this.distressUrls.map(async (url) => ({
          url,
          records: await loadOpenRecords(url),
        })),
      );
      const matches = loaded.flatMap(({ url, records }) =>
        records
          .filter((record) => addressMatches(record, input.address))
          .map((record) => ({ url, record })),
      );
      if (matches.length === 0) {
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

      const first = matches[0]!;
      const record = first.record;
      const label =
        record.record_type ??
        record.violation_type ??
        record.case_type ??
        record.category ??
        record.type ??
        record.status ??
        "public distress record";
      const date = record.date ?? record.created_date ?? record.inspection_date;
      const source = record.source || "Open county data";
      return [
        {
          scout: "risk",
          claim: "Open distress signal",
          value: `${label}${date ? ` · ${date}` : ""}`,
          sources: [{ name: source, url: record.source_url ?? record.url ?? first.url }],
          confidence: matches.length >= 2 ? "B" : "C",
          reasoning:
            matches.length >= 2
              ? `${matches.length} public distress record(s) matched this address.`
              : "Single public distress record matched this address; verify before prioritizing outreach.",
        },
      ];
    } catch (e) {
      log("warn", "provider.distress.failed", {
        error: e instanceof Error ? e.message : String(e),
        urls: this.distressUrls.length,
      });
      return [
        {
          scout: "risk",
          claim: "Open distress signals",
          value: null,
          sources: [],
          confidence: "D",
          reasoning: "Public distress records weren't reachable just now — they'll load on the next look.",
        },
      ];
    }
  }

  private async hazardFromUrl(rawHazardUrl: string, input: PropertyQuery): Promise<EvidenceCard[]> {
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
            sources: [{ name: sourceNameForHazard(rawHazardUrl), url: rawHazardUrl }],
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
      const sourceName = sourceNameForHazard(rawHazardUrl);
      return [
        {
          scout: "risk",
          claim: "Flood risk",
          value: subtype ? `${sourceName} ${zone} · ${subtype}` : `${sourceName} ${zone}`,
          sources: [{ name: sourceName, url: rawHazardUrl }],
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

// ---- Mapillary imagery ------------------------------------------------------

export class MapillaryImageryProvider implements ImageryProvider {
  readonly name = "mapillary";
  readonly mode = "live" as const;
  constructor(private token: string) {}

  async street(q: PropertyQuery): Promise<EvidenceCard[]> {
    const bbox = [q.lng - 0.0006, q.lat - 0.0006, q.lng + 0.0006, q.lat + 0.0006].join(",");
    const url = `https://graph.mapillary.com/images?access_token=${this.token}&fields=id&bbox=${bbox}&limit=5`;
    try {
      const res = await fetch(url);
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
      const data = (await res.json()) as { data?: { id: string }[] };
      const n = data.data?.length ?? 0;
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
      return [
        {
          scout: "imagery",
          claim: "Street imagery",
          value: `${n} frame${n > 1 ? "s" : ""}`,
          sources: [{ name: "Mapillary", url: "https://mapillary.com" }, { name: "CC-BY-SA" }],
          confidence: "A",
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
