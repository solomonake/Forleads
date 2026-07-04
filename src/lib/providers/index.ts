// ============================================================================
// Provider factory — selects mock vs. real adapter per env config. This is the
// single seam where "global free floor" degrades up to richer per-market data.
// ============================================================================

import { config } from "@/lib/core/config";
import {
  MockGeocodeProvider,
  MockImageryProvider,
  MockPropertyProvider,
  MockRiskProvider,
} from "./mock";
import {
  MapillaryImageryProvider,
  OpenDataPropertyProvider,
  OpenRiskDataProvider,
  OSMPropertyProvider,
  PhotonNominatimGeocodeProvider,
  PublicNominatimGeocodeProvider,
} from "./real";
import type {
  GeocodeProvider,
  ImageryProvider,
  PropertyDataProvider,
  RiskDataProvider,
} from "./types";

export function getGeocodeProvider(): GeocodeProvider {
  if (config.geocoder === "photon-nominatim") {
    return new PhotonNominatimGeocodeProvider(
      process.env.PHOTON_URL ?? "http://localhost:2322",
      process.env.NOMINATIM_URL ?? "http://localhost:8080"
    );
  }
  if (config.geocoder === "nominatim") {
    // Public OSM Nominatim — no self-hosting required. Fair-use: low QPS.
    return new PublicNominatimGeocodeProvider(
      process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org"
    );
  }
  return new MockGeocodeProvider();
}

export function getPropertyProvider(): PropertyDataProvider {
  if (config.propertyProvider === "open-data") return new OpenDataPropertyProvider();
  if (config.propertyProvider === "osm") return new OSMPropertyProvider();
  return new MockPropertyProvider();
}

export function getImageryProvider(): ImageryProvider {
  if (config.imageryProvider === "mapillary" && process.env.MAPILLARY_TOKEN) {
    return new MapillaryImageryProvider(process.env.MAPILLARY_TOKEN);
  }
  return new MockImageryProvider();
}

export function getRiskProvider(): RiskDataProvider {
  if (
    process.env.FEMA_NFHL_URL ||
    process.env.OPEN_HAZARD_LAYER_URL ||
    process.env.OPEN_DISTRESS_DATA_URL ||
    process.env.TAX_DELINQUENCY_DATA_URL ||
    process.env.CODE_VIOLATION_DATA_URL ||
    process.env.VACANT_REGISTRY_DATA_URL ||
    process.env.US_HAZARD_LAYER_URL ||
    process.env.UK_HAZARD_LAYER_URL ||
    process.env.EU_HAZARD_LAYER_URL ||
    process.env.AFRICA_HAZARD_LAYER_URL ||
    process.env.US_DISTRESS_DATA_URL ||
    process.env.UK_DISTRESS_DATA_URL ||
    process.env.EU_DISTRESS_DATA_URL ||
    process.env.AFRICA_DISTRESS_DATA_URL
  ) {
    return new OpenRiskDataProvider();
  }
  return new MockRiskProvider();
}

export * from "./types";
