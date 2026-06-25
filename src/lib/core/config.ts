// ============================================================================
// Runtime configuration — the single place that decides mock vs. live for
// every provider/connector based on env vars. Server-only.
// SECURITY: import this module ONLY from server routes / server modules. It
// reads secrets from process.env. Client components must fetch data via /api.
// ============================================================================

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

const production = process.env.NODE_ENV === "production";
const supabaseConfigured = Boolean(
  env("NEXT_PUBLIC_SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY"),
);
const appUrl =
  env("NEXT_PUBLIC_APP_URL") ??
  (env("VERCEL_PROJECT_PRODUCTION_URL")
    ? `https://${env("VERCEL_PROJECT_PRODUCTION_URL")}`
    : env("VERCEL_URL")
      ? `https://${env("VERCEL_URL")}`
      : undefined);

export const DEMO_AGENT_ID =
  env("FORLEADS_DEMO_AGENT_ID") ?? "00000000-0000-0000-0000-000000000001";

export type Mode = "mock" | "live";

export const config = {
  allowDemoMutations:
    env("FORLEADS_ALLOW_DEMO_MUTATIONS") === "1" ||
    process.env.NODE_ENV === "development",
  agentMode: (env("FORLEADS_AGENT_MODE") ??
    (production && env("ANTHROPIC_API_KEY") ? "live" : "mock")) as Mode,
  claudeModel: env("FORLEADS_CLAUDE_MODEL") ?? "claude-sonnet-4-6",
  anthropicKey: env("ANTHROPIC_API_KEY"),

  persist: (env("FORLEADS_PERSIST") ??
    (production && supabaseConfigured ? "supabase" : "memory")) as "memory" | "supabase",

  propertyProvider: env("FORLEADS_PROPERTY_PROVIDER") ?? (production ? "osm" : "osm-mock"),
  imageryProvider:
    env("FORLEADS_IMAGERY_PROVIDER") ??
    (production && env("MAPILLARY_TOKEN") ? "mapillary" : "mock"),
  geocoder: env("FORLEADS_GEOCODER") ?? (production ? "nominatim" : "mock"),

  supabase: {
    url: env("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceKey: env("SUPABASE_SERVICE_ROLE_KEY"),
  },

  google: {
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
    redirectUri:
      env("GOOGLE_REDIRECT_URI") ??
      `${appUrl ?? "http://localhost:3000"}/api/auth/google/callback`,
    scopes: (
      env("GOOGLE_SCOPES") ??
      "https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events"
    ).split(/\s+/),
  },

  microsoft: {
    clientId: env("MS_CLIENT_ID"),
    clientSecret: env("MS_CLIENT_SECRET"),
  },

  followupboss: {
    apiKey: env("FOLLOWUPBOSS_API_KEY"),
    baseUrl: env("FOLLOWUPBOSS_BASE_URL") ?? "https://api.followupboss.com/v1",
  },

  gohighlevel: {
    apiKey: env("GHL_API_KEY"),
    locationId: env("GHL_LOCATION_ID"),
    baseUrl: env("GHL_BASE_URL") ?? "https://services.leadconnectorhq.com",
  },

  twilio: {
    accountSid: env("TWILIO_ACCOUNT_SID"),
    authToken: env("TWILIO_AUTH_TOKEN"),
    fromNumber: env("TWILIO_FROM_NUMBER"),
  },

  zapier: {
    webhookSecret: env("ZAPIER_WEBHOOK_SECRET"),
  },
} as const;

/** True if Claude credentials are present and live mode requested. */
export function claudeLive(): boolean {
  return config.agentMode === "live" && Boolean(config.anthropicKey);
}
