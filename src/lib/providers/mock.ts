// ============================================================================
// Mock providers — fully working local adapters that honor every contract.
// Deterministic per-address so the demo is stable. These mirror the realistic,
// GRADED, CITED evidence in prototype/index.html (no naked numbers, ever).
// ============================================================================

import type { EvidenceCard } from "@/lib/core/types";
import type {
  GeocodeProvider,
  GeoResult,
  ImageryProvider,
  PropertyDataProvider,
  PropertyQuery,
} from "./types";

// A small global gazetteer so "global from day one" is felt in mock mode.
const PLACES: GeoResult[] = [
  { address: "12 Oak Street", locality: "San Francisco, USA", lng: -122.4469, lat: 37.7694 },
  { address: "221B Baker Street", locality: "London, UK", lng: -0.1574, lat: 51.5237 },
  { address: "Karen Road", locality: "Nairobi, Kenya", lng: 36.7073, lat: -1.3318 },
  { address: "Shibuya 2-chome", locality: "Tokyo, Japan", lng: 139.7005, lat: 35.6595 },
  { address: "Rua Barata Ribeiro", locality: "Rio de Janeiro, Brazil", lng: -43.186, lat: -22.969 },
  { address: "Connaught Place", locality: "New Delhi, India", lng: 77.2167, lat: 28.6315 },
  { address: "Plaka", locality: "Athens, Greece", lng: 23.729, lat: 37.9715 },
  { address: "Bondi Beach Rd", locality: "Sydney, Australia", lng: 151.2744, lat: -33.8908 },
  { address: "8 Pine Road", locality: "Austin, USA", lng: -97.7431, lat: 30.2672 },
  { address: "88 Elm Avenue", locality: "Portland, USA", lng: -122.6765, lat: 45.5231 },
];

// Deterministic pseudo-random from a string seed → stable mock data per address.
function seeded(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MockGeocodeProvider implements GeocodeProvider {
  readonly name = "mock-gazetteer";
  readonly mode = "mock" as const;

  async autocomplete(query: string, limit = 6): Promise<GeoResult[]> {
    const q = query.toLowerCase().trim();
    if (!q) return PLACES.slice(0, limit);
    return PLACES.filter((p) =>
      `${p.address} ${p.locality ?? ""}`.toLowerCase().includes(q)
    ).slice(0, limit);
  }

  async reverse(lng: number, lat: number): Promise<GeoResult | null> {
    // Nearest known place; otherwise synthesize an honest "dropped pin".
    let best: GeoResult | null = null;
    let bestD = Infinity;
    for (const p of PLACES) {
      const d = (p.lng - lng) ** 2 + (p.lat - lat) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best && bestD < 0.0005) return best;
    return {
      address: `Dropped pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      lng,
      lat,
    };
  }
}

export class MockPropertyProvider implements PropertyDataProvider {
  readonly name = "osm-mock";
  readonly mode = "mock" as const;

  async hasCoverage(): Promise<boolean> {
    return true; // OSM floor is global.
  }

  async facts(q: PropertyQuery): Promise<EvidenceCard[]> {
    const rng = seeded(q.address + ":property");
    const yr = 1890 + Math.floor(rng() * 130);
    const m2 = 90 + Math.floor(rng() * 180);
    return [
      {
        scout: "property",
        claim: "Year built",
        value: `~${yr}`,
        sources: [{ name: "OpenStreetMap", url: "https://openstreetmap.org" }],
        confidence: "A",
        reasoning: "Tagged building start_date in OSM.",
      },
      {
        scout: "property",
        claim: "Building footprint",
        value: `~${m2} m²`,
        sources: [{ name: "OSM polygon" }],
        confidence: "B",
        reasoning: "Computed from the OSM building polygon area.",
      },
      {
        scout: "property",
        claim: "Land use",
        value: "Residential",
        sources: [{ name: "OSM" }],
        confidence: "A",
      },
    ];
  }

  async comps(q: PropertyQuery): Promise<EvidenceCard[]> {
    // Honest: the free OSM floor has no comp data. Grade-D gap card.
    return [
      {
        scout: "market",
        claim: "Resale estimate",
        value: null,
        sources: [],
        confidence: "D",
        reasoning:
          "No recent comparable sales for this market in the free tier. Connect a local data source (MLS/ATTOM) to upgrade.",
      },
    ];
  }
}

export class MockImageryProvider implements ImageryProvider {
  readonly name = "mock-imagery";
  readonly mode = "mock" as const;

  async street(q: PropertyQuery): Promise<EvidenceCard[]> {
    const rng = seeded(q.address + ":imagery");
    const frames = 1 + Math.floor(rng() * 4);
    const styles = [
      "Single-story · pitched roof · mature garden",
      "Two-story · flat roof · paved frontage",
      "Bungalow · tiled roof · low fence",
      "Townhouse · brick facade · stoop",
    ];
    return [
      {
        scout: "imagery",
        claim: "Street imagery",
        value: `${frames} frame${frames > 1 ? "s" : ""}`,
        sources: [{ name: "Mapillary", url: "https://mapillary.com" }, { name: "CC-BY-SA" }],
        confidence: "A",
      },
      {
        scout: "imagery",
        claim: "Condition (vision)",
        value: styles[Math.floor(rng() * styles.length)] ?? styles[0]!,
        sources: [{ name: "Imagery Scout · vision caption" }],
        confidence: "C",
        reasoning:
          frames === 1
            ? "Low confidence — inferred from a single frame."
            : "Inferred from street imagery; not a structural inspection.",
      },
    ];
  }

  aerialAttribution(): string {
    return "Imagery © Esri";
  }
}

export const MOCK_PLACES = PLACES;
