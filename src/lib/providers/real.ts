// ============================================================================
// Real provider adapters. Same typed contracts as the mocks; activated by env.
// These make real network calls and STILL enforce the EvidenceCard contract —
// any claim without a source becomes a grade-D gap, never a naked number.
// ============================================================================

import type { EvidenceCard } from "@/lib/core/types";
import { log } from "@/lib/observability";
import type { VisionCaptioner } from "./vision";
import type {
  GeocodeProvider,
  GeoResult,
  ImageryProvider,
  PropertyDataProvider,
  PropertyQuery,
  RiskProvider,
  RiskQuery,
} from "./types";

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
          "OSM carries no sale-price data. Connect a per-market PropertyDataProvider (MLS/ATTOM) to ground comps.",
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

// ---- FEMA NFHL flood zones -------------------------------------------------
// Live probe 2026-06-30: NFHL returns ESRI JSON as
// features[0].attributes.{FLD_ZONE,ZONE_SUBTY,SFHA_TF}.

type FemaNfhlFeature = {
  attributes?: Record<string, unknown>;
  properties?: Record<string, unknown>;
};

const FEMA_NFHL_QUERY_URL =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";
const FEMA_NFHL_SOURCE_URL = "https://hazards.fema.gov/nfhl";

export class FemaNfhlRiskProvider implements RiskProvider {
  readonly name = "fema-nfhl";
  readonly mode = "live" as const;

  constructor(private queryUrl = FEMA_NFHL_QUERY_URL) {}

  async flood(q: RiskQuery): Promise<EvidenceCard[]> {
    const url = this.buildQueryUrl(q);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Forleads/1.0 (real-estate CRM; +https://forleads.vercel.app)",
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      if (!res.ok) return this.gap(`FEMA NFHL request failed with HTTP ${res.status}.`, url);

      const data = (await res.json()) as { features?: FemaNfhlFeature[] };
      const feature = data.features?.[0];
      if (!feature) {
        return this.gap("Point is outside FEMA NFHL coverage or has no mapped flood-zone polygon.", url);
      }

      const attrs = feature.attributes ?? feature.properties ?? {};
      const zone = textAttr(attrs, "FLD_ZONE");
      if (!zone) {
        return this.gap("FEMA NFHL returned a feature without a flood-zone code.", url);
      }

      const sfha = parseSfha(textAttr(attrs, "SFHA_TF"));
      const subtype = textAttr(attrs, "ZONE_SUBTY");
      const value = sfha === true ? `${zone} — high-risk SFHA` : `${zone} — SFHA: ${sfha === false ? "no" : "unknown"}`;
      return [
        {
          scout: "risk",
          claim: "Flood zone",
          value: subtype ? `${value} · ${subtype}` : value,
          sources: [{ name: "FEMA NFHL", url }],
          confidence: "A",
          reasoning: "FEMA National Flood Hazard Layer polygon intersected the lead coordinates.",
        },
      ];
    } catch (error) {
      const reason =
        error instanceof DOMException && error.name === "AbortError"
          ? "FEMA NFHL request timed out."
          : "Network error reaching FEMA NFHL.";
      return this.gap(reason, url);
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildQueryUrl(q: RiskQuery): string {
    const url = new URL(this.queryUrl);
    url.searchParams.set("f", "json");
    url.searchParams.set("geometry", `${q.lng},${q.lat}`);
    url.searchParams.set("geometryType", "esriGeometryPoint");
    url.searchParams.set("inSR", "4326");
    url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
    url.searchParams.set("outFields", "FLD_ZONE,ZONE_SUBTY,SFHA_TF");
    url.searchParams.set("returnGeometry", "false");
    url.searchParams.set("resultRecordCount", "1");
    return url.toString();
  }

  private gap(reason: string, url = FEMA_NFHL_SOURCE_URL): EvidenceCard[] {
    return [
      {
        scout: "risk",
        claim: "Flood zone",
        value: null,
        sources: [{ name: "FEMA NFHL", url }],
        confidence: "D",
        reasoning: reason,
      },
    ];
  }
}

function textAttr(attrs: Record<string, unknown>, key: string): string | undefined {
  const value = attrs[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseSfha(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  if (/^(t|true|yes|y|1)$/i.test(value)) return true;
  if (/^(f|false|no|n|0)$/i.test(value)) return false;
  return undefined;
}

// ---- Mapillary imagery ------------------------------------------------------

export class MapillaryImageryProvider implements ImageryProvider {
  readonly name = "mapillary";
  readonly mode = "live" as const;
  constructor(
    private token: string,
    private vision?: VisionCaptioner | null,
    private fetcher: typeof fetch = fetch,
  ) {}

  async street(q: PropertyQuery): Promise<EvidenceCard[]> {
    const bbox = [q.lng - 0.0006, q.lat - 0.0006, q.lng + 0.0006, q.lat + 0.0006].join(",");
    const url =
      `https://graph.mapillary.com/images?access_token=${this.token}` +
      `&fields=id,thumb_1024_url&bbox=${bbox}&limit=5`;
    try {
      const res = await this.fetcher(url);
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
      const data = (await res.json()) as {
        data?: { id: string; thumb_1024_url?: string | null }[];
      };
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
      const cards: EvidenceCard[] = [
        {
          scout: "imagery",
          claim: "Street imagery",
          value: `${n} frame${n > 1 ? "s" : ""}`,
          sources: [{ name: "Mapillary", url: "https://mapillary.com" }, { name: "CC-BY-SA" }],
          confidence: "A",
        },
      ];
      if (!this.vision) return cards;
      const frames =
        (data.data ?? [])
          .filter((entry) => typeof entry.thumb_1024_url === "string" && entry.thumb_1024_url)
          .slice(0, 3)
          .map((entry) => ({ id: entry.id, url: entry.thumb_1024_url! }));
      if (frames.length === 0) return cards;
      try {
        const captions = await this.vision.caption({
          address: q.address,
          lng: q.lng,
          lat: q.lat,
          frameIds: frames.map((frame) => frame.id),
          frameUrls: frames.map((frame) => frame.url),
        });
        return [...cards, ...captions];
      } catch {
        log("warn", "vision_caption_failed", {
          provider: this.vision.name,
          frameCount: frames.length,
        });
        return cards;
      }
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
