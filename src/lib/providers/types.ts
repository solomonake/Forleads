// ============================================================================
// Provider interfaces. Each external data source is abstracted so the swarm
// degrades gracefully and stays global from day one
// (docs/Forleads_Architecture_v1.md §4, _MapGIS_ §8).
// ============================================================================

import type { EvidenceCard, ScoutType } from "@/lib/core/types";

export interface GeoResult {
  address: string;
  locality?: string;
  lng: number;
  lat: number;
  bbox?: [number, number, number, number];
  mode?: "catalog" | "synthetic";
}

export interface GeocodeProvider {
  readonly name: string;
  readonly mode: "mock" | "live";
  autocomplete(query: string, limit?: number): Promise<GeoResult[]>;
  reverse(lng: number, lat: number): Promise<GeoResult | null>;
}

/**
 * PropertyDataProvider — OSM is the free global floor; richer per-market
 * sources implement the same interface (user brings their key). A provider
 * returns typed EvidenceCards ONLY — never a naked number.
 */
export interface PropertyDataProvider {
  readonly name: string;
  readonly mode: "mock" | "live";
  /** True if this provider has meaningful coverage at a point. */
  hasCoverage(lng: number, lat: number): Promise<boolean>;
  facts(input: PropertyQuery): Promise<EvidenceCard[]>;
  /** Market comps — may legitimately return a grade-D gap card. */
  comps(input: PropertyQuery): Promise<EvidenceCard[]>;
}

export interface ImageryProvider {
  readonly name: string;
  readonly mode: "mock" | "live";
  street(input: PropertyQuery): Promise<EvidenceCard[]>;
  aerialAttribution(): string;
}

export interface PropertyQuery {
  lng: number;
  lat: number;
  address: string;
  scout: ScoutType;
}
