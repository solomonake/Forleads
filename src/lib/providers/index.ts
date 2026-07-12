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
  GoogleStreetViewImageryProvider,
  LicensedPropertyProvider,
  MapillaryImageryProvider,
  NoStreetImageryProvider,
  OpenDataPropertyProvider,
  OpenRiskDataProvider,
  OperatorPropertyMediaProvider,
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
  if (config.propertyProvider === "attom") return new LicensedPropertyProvider("attom");
  if (config.propertyProvider === "rentcast") return new LicensedPropertyProvider("rentcast");
  if (config.propertyProvider === "regrid") return new LicensedPropertyProvider("regrid");
  if (config.propertyProvider === "reportall") return new LicensedPropertyProvider("reportall");
  if (config.propertyProvider === "reso") return new LicensedPropertyProvider("reso");
  if (config.propertyProvider === "mls-grid") return new LicensedPropertyProvider("mls-grid");
  if (config.propertyProvider === "open-data") return new OpenDataPropertyProvider();
  if (config.propertyProvider === "osm") return new OSMPropertyProvider();
  return new MockPropertyProvider();
}

export function getImageryProvider(): ImageryProvider {
  const operatorMediaConfigured = Boolean(
    process.env.OPERATOR_PROPERTY_MEDIA_URL ||
      process.env.FIELD_PHOTO_MANIFEST_URL ||
      process.env.NEXT_PUBLIC_FIELD_PHOTOS
  );
  let base: ImageryProvider;
  if (config.imageryProvider === "mapillary" && process.env.MAPILLARY_TOKEN) {
    base = new MapillaryImageryProvider(process.env.MAPILLARY_TOKEN);
  } else if (config.imageryProvider === "google-street-view" && config.googleMapsKey) {
    base = new GoogleStreetViewImageryProvider(config.googleMapsKey);
  } else if (operatorMediaConfigured || config.production) {
    base = new NoStreetImageryProvider();
  } else {
    base = new MockImageryProvider();
  }
  return operatorMediaConfigured ? new OperatorPropertyMediaProvider(base) : base;
}

export function getRiskProvider(): RiskDataProvider {
  // Production always gets the open provider: the built-in catalog carries
  // FEMA NFHL + EA flood layers and city violation feeds with no env needed.
  if (
    config.production ||
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
