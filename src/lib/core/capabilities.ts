// ============================================================================
// Capability probes for /api/health (G10). Configuration says what was asked
// for; a capability says whether that path can actually run right now.
//
// Rules for every probe here:
// - Cheap and side-effect free: no paid calls, no network, no writes. The
//   Claude probe checks that a key is present and the SDK client constructs;
//   it never calls the model.
// - Presence only: booleans and mode names, never a credential value.
// - Cached for CAPABILITY_TTL_MS per server instance so a health poller can't
//   turn the probe into load.
// SERVER-ONLY (reads config).
// ============================================================================

import { claudeLive, config } from "@/lib/core/config";

export type CapabilityStatus =
  /** Requested live and able to run. */
  | "live"
  /** Requested live but a required key is missing; the app falls back. */
  | "configured_no_key"
  /** Key present but the client failed to construct. */
  | "client_error"
  /** No live path configured; an honest "no data" or template path runs. */
  | "unavailable"
  /** Mock / in-memory (development). */
  | "mock";

export interface Capability {
  /** What configuration asked for (the old `modes.*` value). */
  requested: string;
  status: CapabilityStatus;
  /** Whether the credentials this path needs are present. Never the values. */
  keyConfigured: boolean;
  /** Plain-language reason when status isn't "live". */
  detail?: string;
}

export interface CapabilityReport {
  checkedAt: string;
  agent: Capability;
  imagery: Capability;
  geocoder: Capability;
  property: Capability;
  persistence: Capability;
  googleSignIn: Capability;
}

export const CAPABILITY_TTL_MS = 60_000;

let cached: { at: number; report: CapabilityReport } | null = null;

/** Test hook. */
export function resetCapabilityCache(): void {
  cached = null;
}

async function agentCapability(): Promise<Capability> {
  const requested = config.agentMode;
  const keyConfigured = Boolean(config.anthropicKey);
  if (requested !== "live") {
    return {
      requested,
      status: "mock",
      keyConfigured,
      detail: "Drafts and classifications use deterministic templates.",
    };
  }
  if (!keyConfigured) {
    return {
      requested,
      status: "configured_no_key",
      keyConfigured,
      detail: "Agent mode is live but ANTHROPIC_API_KEY is not set, so drafts fall back to templates.",
    };
  }
  try {
    // Lazy import keeps the SDK out of mock mode, as the composer does.
    const { claudeClientReady } = await import("@/lib/agents/claude");
    if (claudeLive() && claudeClientReady()) return { requested, status: "live", keyConfigured };
  } catch {
    // fall through
  }
  return {
    requested,
    status: "client_error",
    keyConfigured,
    detail: "The Claude client did not construct; drafts fall back to templates.",
  };
}

function imageryCapability(): Capability {
  const requested = config.imageryProvider;
  const operatorMedia = Boolean(
    process.env.OPERATOR_PROPERTY_MEDIA_URL?.trim() ||
      process.env.FIELD_PHOTO_MANIFEST_URL?.trim() ||
      process.env.NEXT_PUBLIC_FIELD_PHOTOS?.trim(),
  );
  // Mirrors getImageryProvider(): a provider named without its key falls back.
  if (requested === "mapillary") {
    const keyConfigured = Boolean(process.env.MAPILLARY_TOKEN?.trim());
    return keyConfigured
      ? { requested, status: "live", keyConfigured }
      : { requested, status: "configured_no_key", keyConfigured, detail: "MAPILLARY_TOKEN is not set; no street imagery is shown." };
  }
  if (requested === "google-street-view") {
    const keyConfigured = Boolean(config.googleMapsKey);
    return keyConfigured
      ? { requested, status: "live", keyConfigured }
      : { requested, status: "configured_no_key", keyConfigured, detail: "GOOGLE_MAPS_API_KEY is not set; no street imagery is shown." };
  }
  if (requested === "operator-property-media") {
    return operatorMedia
      ? { requested, status: "live", keyConfigured: true }
      : { requested, status: "configured_no_key", keyConfigured: false, detail: "No operator media feed URL is set." };
  }
  if (requested === "mock" && !config.production) {
    return { requested, status: "mock", keyConfigured: false };
  }
  return {
    requested,
    status: "unavailable",
    keyConfigured: false,
    detail: "No street imagery provider is configured; imagery cards say so.",
  };
}

function geocoderCapability(): Capability {
  const requested = config.geocoder;
  if (requested === "mock") return { requested, status: "mock", keyConfigured: false };
  if (requested === "photon-nominatim") {
    const keyConfigured = Boolean(process.env.PHOTON_URL?.trim() && process.env.NOMINATIM_URL?.trim());
    return keyConfigured
      ? { requested, status: "live", keyConfigured }
      : { requested, status: "configured_no_key", keyConfigured, detail: "Self-hosted geocoding needs PHOTON_URL and NOMINATIM_URL; without them it points at localhost." };
  }
  // Public Photon + Nominatim: no key needed.
  return { requested, status: "live", keyConfigured: true };
}

function propertyCapability(): Capability {
  const requested = config.propertyProvider;
  if (requested === "osm-mock") return { requested, status: "mock", keyConfigured: false };
  const licensed = ["attom", "rentcast", "regrid", "reportall", "reso", "mls-grid"];
  if (licensed.includes(requested)) {
    // No licensed vendor integration exists yet: these adapters return gap cards.
    return {
      requested,
      status: "unavailable",
      keyConfigured: false,
      detail: "Licensed property adapters return gap cards; no vendor integration exists yet.",
    };
  }
  // OSM / open-data: public sources, no key.
  return { requested, status: "live", keyConfigured: true };
}

function persistenceCapability(): Capability {
  const requested = config.persist;
  if (requested === "memory") {
    return { requested, status: config.production ? "unavailable" : "mock", keyConfigured: false, detail: "In-memory store; data does not survive a restart." };
  }
  const keyConfigured = Boolean(config.supabase.url && config.supabase.serviceKey);
  // The health route proves the read path itself (listLeads + schema check).
  return keyConfigured
    ? { requested, status: "live", keyConfigured }
    : { requested, status: "configured_no_key", keyConfigured, detail: "Supabase URL or service key is not set." };
}

function googleSignInCapability(): Capability {
  const keyConfigured = Boolean(
    config.google.clientId &&
      config.google.clientSecret &&
      (process.env.SESSION_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim()),
  );
  return keyConfigured
    ? { requested: "google", status: "live", keyConfigured }
    : {
        requested: "google",
        status: "configured_no_key",
        keyConfigured,
        detail: "Google sign-in needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and SESSION_SECRET.",
      };
}

export async function capabilityReport(now = Date.now()): Promise<CapabilityReport> {
  if (cached && now - cached.at < CAPABILITY_TTL_MS) return cached.report;
  const report: CapabilityReport = {
    checkedAt: new Date(now).toISOString(),
    agent: await agentCapability(),
    imagery: imageryCapability(),
    geocoder: geocoderCapability(),
    property: propertyCapability(),
    persistence: persistenceCapability(),
    googleSignIn: googleSignInCapability(),
  };
  cached = { at: now, report };
  return report;
}

/** Capabilities that were asked for but can't run: the honest "degraded" list. */
export function degradedCapabilities(report: CapabilityReport): string[] {
  return (Object.entries(report) as [string, Capability | string][])
    .filter(([, c]) => typeof c === "object" && (c.status === "configured_no_key" || c.status === "client_error"))
    .map(([name]) => name);
}

/**
 * The value `modes.*` reports: the effective mode, so "live" is never shown
 * for a path that is really running its fallback.
 */
export function effectiveMode(c: Capability): string {
  return c.status === "live" || c.status === "mock" || c.status === "unavailable" ? c.requested : c.status;
}
