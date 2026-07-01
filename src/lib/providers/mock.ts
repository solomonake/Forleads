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
  RiskProvider,
  RiskQuery,
} from "./types";

// A small global gazetteer so "global from day one" is felt in mock mode.
const PLACES: GeoResult[] = [
  { address: "12 Oak Street", locality: "San Francisco, USA", lng: -122.4469, lat: 37.7694, mode: "catalog" },
  { address: "221B Baker Street", locality: "London, UK", lng: -0.1574, lat: 51.5237, mode: "catalog" },
  { address: "Karen Road", locality: "Nairobi, Kenya", lng: 36.7073, lat: -1.3318, mode: "catalog" },
  { address: "Shibuya 2-chome", locality: "Tokyo, Japan", lng: 139.7005, lat: 35.6595, mode: "catalog" },
  { address: "Rua Barata Ribeiro", locality: "Rio de Janeiro, Brazil", lng: -43.186, lat: -22.969, mode: "catalog" },
  { address: "Connaught Place", locality: "New Delhi, India", lng: 77.2167, lat: 28.6315, mode: "catalog" },
  { address: "Plaka", locality: "Athens, Greece", lng: 23.729, lat: 37.9715, mode: "catalog" },
  { address: "Bondi Beach Rd", locality: "Sydney, Australia", lng: 151.2744, lat: -33.8908, mode: "catalog" },
  { address: "8 Pine Road", locality: "Austin, USA", lng: -97.7431, lat: 30.2672, mode: "catalog" },
  { address: "88 Elm Avenue", locality: "Portland, USA", lng: -122.6765, lat: 45.5231, mode: "catalog" },
];

const REGION_HINTS: { pattern: RegExp; locality: string; lng: number; lat: number }[] = [
  { pattern: /\b(clarksburg|gaithersburg|rockville|maryland|bethesda)\b/i, locality: "Maryland, USA", lng: -77.2717, lat: 39.2387 },
  { pattern: /\b(kampala|uganda)\b/i, locality: "Central Region, Uganda", lng: 32.5825, lat: 0.3476 },
  { pattern: /\b(nairobi|karen|kenya)\b/i, locality: "Nairobi, Kenya", lng: 36.8219, lat: -1.2921 },
  { pattern: /\b(london|uk|england)\b/i, locality: "London, UK", lng: -0.1276, lat: 51.5072 },
  { pattern: /\b(tokyo|shibuya|japan)\b/i, locality: "Tokyo, Japan", lng: 139.6917, lat: 35.6895 },
  { pattern: /\b(rio|copacabana|brazil)\b/i, locality: "Rio de Janeiro, Brazil", lng: -43.1729, lat: -22.9068 },
  { pattern: /\b(delhi|india|connaught)\b/i, locality: "New Delhi, India", lng: 77.209, lat: 28.6139 },
  { pattern: /\b(athens|plaka|greece)\b/i, locality: "Athens, Greece", lng: 23.7275, lat: 37.9838 },
  { pattern: /\b(sydney|bondi|australia)\b/i, locality: "Sydney, Australia", lng: 151.2093, lat: -33.8688 },
  { pattern: /\b(austin|texas)\b/i, locality: "Texas, USA", lng: -97.7431, lat: 30.2672 },
  { pattern: /\b(portland|oregon)\b/i, locality: "Oregon, USA", lng: -122.6765, lat: 45.5231 },
  { pattern: /\b(san francisco|california)\b/i, locality: "California, USA", lng: -122.4194, lat: 37.7749 },
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

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function localityFromQuery(query: string, fallback?: string): string | undefined {
  const parts = query
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(", ");
  return fallback;
}

export function synthesizeGeoResult(query: string): GeoResult | null {
  const cleaned = normalizeQuery(query);
  if (cleaned.length < 5) return null;

  const hint = REGION_HINTS.find((entry) => entry.pattern.test(cleaned));
  const rng = seeded(`${cleaned}:freeform`);
  const baseLng = hint?.lng ?? -150 + rng() * 300;
  const baseLat = hint?.lat ?? -45 + rng() * 90;

  return {
    address: cleaned,
    locality: localityFromQuery(cleaned, hint?.locality) ?? "Typed search area",
    lng: clamp(baseLng + (rng() - 0.5) * 0.18, -179.9, 179.9),
    lat: clamp(baseLat + (rng() - 0.5) * 0.12, -58, 75),
    mode: "synthetic",
  };
}

export class MockGeocodeProvider implements GeocodeProvider {
  readonly name = "mock-gazetteer";
  readonly mode = "mock" as const;

  async autocomplete(query: string, limit = 6): Promise<GeoResult[]> {
    const q = normalizeQuery(query).toLowerCase();
    if (!q) return PLACES.slice(0, limit);
    const matches = PLACES.filter((p) =>
      `${p.address} ${p.locality ?? ""}`.toLowerCase().includes(q)
    );
    const synthetic = synthesizeGeoResult(query);
    if (!synthetic) return matches.slice(0, limit);
    const duplicate = matches.some((place) => normalizeQuery(place.address).toLowerCase() === q);
    return (duplicate ? matches : [synthetic, ...matches]).slice(0, limit);
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

export class MockRiskProvider implements RiskProvider {
  readonly name = "mock-risk";
  readonly mode = "mock" as const;

  async flood(q: RiskQuery): Promise<EvidenceCard[]> {
    const inFixtureCell = Math.abs(q.lng - -95.3979) < 0.02 && Math.abs(q.lat - 29.7858) < 0.02;
    if (!inFixtureCell) {
      return [
        {
          scout: "risk",
          claim: "Flood zone",
          value: null,
          sources: [{ name: "FEMA NFHL", url: "https://hazards.fema.gov/nfhl" }],
          confidence: "D",
          reasoning: "Mock risk provider has no configured flood-zone fixture for this point.",
        },
      ];
    }

    return [
      {
        scout: "risk",
        claim: "Flood zone",
        value: "AE — high-risk SFHA",
        sources: [{ name: "FEMA NFHL", url: "https://hazards.fema.gov/nfhl" }],
        confidence: "A",
        reasoning: "Deterministic mock fixture shaped like an NFHL flood-zone hit.",
      },
    ];
  }
}

export const MOCK_PLACES = PLACES;
