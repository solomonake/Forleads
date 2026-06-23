// ============================================================================
// Real provider adapters. Same typed contracts as the mocks; activated by env.
// These make real network calls and STILL enforce the EvidenceCard contract —
// any claim without a source becomes a grade-D gap, never a naked number.
// ============================================================================

import type { EvidenceCard } from "@/lib/core/types";
import type {
  GeocodeProvider,
  GeoResult,
  ImageryProvider,
  PropertyDataProvider,
  PropertyQuery,
} from "./types";

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
        headers: { "Content-Type": "text/plain" },
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
