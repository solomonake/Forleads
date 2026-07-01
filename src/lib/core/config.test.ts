import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("coreLiveModeViolations", () => {
  it("flags mock risk provider in production live-mode checks", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      FORLEADS_GEOCODER: "nominatim",
      FORLEADS_PROPERTY_PROVIDER: "osm",
      FORLEADS_IMAGERY_PROVIDER: "mapillary",
      MAPILLARY_TOKEN: "mapillary-token",
      FORLEADS_AGENT_MODE: "live",
      ANTHROPIC_API_KEY: "anthropic-key",
      FORLEADS_RISK_PROVIDER: "mock",
    };
    vi.resetModules();

    const { coreLiveModeViolations } = await import("./config");

    expect(coreLiveModeViolations()).toEqual(["risk"]);
  });
});
