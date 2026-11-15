// Google identity sign-in and explicit optional connector authorization.
import { config } from "@/lib/core/config";
import type { GoogleTokens } from "./session";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export const IDENTITY_SCOPES = [
  "openid",
  "email",
  "profile",
];

export const CONNECTOR_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.events",
];
export function hasGoogleScope(scope: string | undefined, required: string): boolean {
  return (scope ?? "").split(/\s+/).includes(required);
}
export function hasGoogleConnectorScopes(scope: string | undefined): boolean {
  return CONNECTOR_SCOPES.every(s => hasGoogleScope(scope, s));
}

export function googleConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

export function buildAuthUrl(state: string, intent: "signin" | "connect" = "signin"): string {
  const params = new URLSearchParams({
    client_id: config.google.clientId ?? "",
    redirect_uri: config.google.redirectUri,
    response_type: "code",
    scope: (intent === "connect" ? [...IDENTITY_SCOPES, ...CONNECTOR_SCOPES] : IDENTITY_SCOPES).join(" "),
    access_type: intent === "connect" ? "offline" : "online",
    include_granted_scopes: intent === "connect" ? "true" : "false",
    ...(intent === "connect" ? { prompt: "consent" } : {}),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface GoogleProfile {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId ?? "",
      client_secret: config.google.clientSecret ?? "",
      redirect_uri: config.google.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const d = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expiry: Date.now() + d.expires_in * 1000,
    scope: d.scope,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.google.clientId ?? "",
      client_secret: config.google.clientSecret ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  const d = (await res.json()) as { access_token: string; expires_in: number; scope: string };
  return {
    access_token: d.access_token,
    refresh_token: refreshToken, // refresh tokens are reused
    expiry: Date.now() + d.expires_in * 1000,
    scope: d.scope,
  };
}

export async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  const d = (await res.json()) as { sub: string; name?: string; email: string; picture?: string };
  return { sub: d.sub, name: d.name ?? d.email, email: d.email, picture: d.picture };
}

/** Return a valid access token, refreshing if it's within 60s of expiry. */
export async function freshAccessToken(tokens: GoogleTokens): Promise<GoogleTokens> {
  if (tokens.expiry - Date.now() > 60_000) return tokens;
  if (!tokens.refresh_token) return tokens; // can't refresh; caller handles failure
  const fresh = await refreshAccessToken(tokens.refresh_token);
  return { ...fresh, scope: fresh.scope ?? tokens.scope };
}
