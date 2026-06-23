// ============================================================================
// Provider factory — selects mock vs. real adapter per env config. This is the
// single seam where "global free floor" degrades up to richer per-market data.
// ============================================================================

import { config } from "@/lib/core/config";
import {
  MockGeocodeProvider,
  MockImageryProvider,
  MockPropertyProvider,
} from "./mock";
import {
  MapillaryImageryProvider,
  OSMPropertyProvider,
  PhotonNominatimGeocodeProvider,
} from "./real";
import type {
  GeocodeProvider,
  ImageryProvider,
  PropertyDataProvider,
} from "./types";

export function getGeocodeProvider(): GeocodeProvider {
  if (config.geocoder === "photon-nominatim") {
    return new PhotonNominatimGeocodeProvider(
      process.env.PHOTON_URL ?? "http://localhost:2322",
      process.env.NOMINATIM_URL ?? "http://localhost:8080"
    );
  }
  return new MockGeocodeProvider();
}

export function getPropertyProvider(): PropertyDataProvider {
  if (config.propertyProvider === "osm") return new OSMPropertyProvider();
  // "attom" / per-market live providers would be selected here when keyed.
  return new MockPropertyProvider();
}

export function getImageryProvider(): ImageryProvider {
  if (config.imageryProvider === "mapillary" && process.env.MAPILLARY_TOKEN) {
    return new MapillaryImageryProvider(process.env.MAPILLARY_TOKEN);
  }
  return new MockImageryProvider();
}

export * from "./types";
