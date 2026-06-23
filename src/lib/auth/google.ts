// ============================================================================
// Google OAuth 2.0 — login + Gmail/Calendar authorization in one consent.
// Scopes are minimal: identity (openid/email/profile) + gmail.compose (drafts
// only, never full mailbox) + calendar.events. access_type=offline yields a
// refresh_token so drafts keep working without re-login.
// ============================================================================

import { config } from "@/lib/core/config";
import type { GoogleTokens } from "./session";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.events",
];

export function googleConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.google.clientId ?? "",
    redirect_uri: config.google.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent", // force a refresh_token every time
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
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
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
  return refreshAccessToken(tokens.refresh_token);
}
