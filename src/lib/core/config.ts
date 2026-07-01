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

function intEnv(key: string, fallback: number): number {
  const raw = env(key);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
  production,
  allowMockConnectorWrites:
    !production || env("FORLEADS_ALLOW_PRODUCTION_MOCKS") === "1",
  allowDemoMutations:
    env("FORLEADS_ALLOW_DEMO_MUTATIONS") === "1" ||
    process.env.NODE_ENV === "development",
  rateLimitDailyQuota: intEnv("RATE_LIMIT_DAILY_QUOTA", 5000),
  welcomeEmailEnabled:
    env("WELCOME_EMAIL_ENABLED") === "1" || env("WELCOME_EMAIL_ENABLED") === "true",
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
  riskProvider: env("FORLEADS_RISK_PROVIDER") ?? (production ? "fema-nfhl" : "mock"),
  visionProvider: (env("FORLEADS_VISION") ?? "off") as "gemini" | "mock" | "off",
  visionModel: env("FORLEADS_VISION_MODEL") ?? "gemini-2.5-flash",

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

  geminiKey: env("GEMINI_API_KEY"),

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

  sentry: {
    dsn: env("SENTRY_DSN"),
  },

  founder: {
    email: env("FOUNDER_EMAIL") ?? "solomonriting@gmail.com",
    sub: env("FOUNDER_SUB"),
  },
} as const;

export function coreLiveModeViolations(): string[] {
  if (!production) return [];
  const violations: string[] = [];
  if (config.persist !== "supabase") violations.push("persistence");
  if (config.geocoder === "mock") violations.push("geocoder");
  if (config.propertyProvider === "osm-mock") violations.push("property");
  if (config.imageryProvider === "mock") violations.push("imagery");
  if (config.riskProvider === "mock") violations.push("risk");
  if (config.agentMode === "mock") violations.push("agent");
  return violations;
}

/** True if Claude credentials are present and live mode requested. */
export function claudeLive(): boolean {
  return config.agentMode === "live" && Boolean(config.anthropicKey);
}

export function visionLive(): boolean {
  return config.visionProvider === "gemini" && Boolean(config.geminiKey);
}
