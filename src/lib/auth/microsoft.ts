// ============================================================================
// Microsoft identity platform OAuth 2.0 — Outlook drafts + Calendar events.
// Scopes:
//   - openid / profile / email — identity
//   - Mail.ReadWrite — createDraft, updateDraft (drafts only, never sends
//     without the human gate; the connector never asks for Mail.Send)
//   - Calendars.ReadWrite — createCalendarEvent (holds only)
//   - offline_access — refresh_token so drafts keep working without re-login
// ============================================================================

import { config } from "@/lib/core/config";

const SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "Mail.ReadWrite",
  "Calendars.ReadWrite",
];

export interface MicrosoftTokens {
  access_token: string;
  refresh_token?: string;
  expiry: number;
  scope: string;
}

export interface MicrosoftProfile {
  sub: string;
  name: string;
  email: string;
}

function authorityBase(): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(config.microsoft.tenant)}`;
}

export function microsoftConfigured(): boolean {
  return Boolean(config.microsoft.clientId && config.microsoft.clientSecret);
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.microsoft.clientId ?? "",
    redirect_uri: config.microsoft.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: SCOPES.join(" "),
    prompt: "consent",
    state,
  });
  return `${authorityBase()}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<MicrosoftTokens> {
  const res = await fetch(`${authorityBase()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.microsoft.clientId ?? "",
      client_secret: config.microsoft.clientSecret ?? "",
      redirect_uri: config.microsoft.redirectUri,
      grant_type: "authorization_code",
      scope: SCOPES.join(" "),
    }),
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  }
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

export async function refreshAccessToken(refreshToken: string): Promise<MicrosoftTokens> {
  const res = await fetch(`${authorityBase()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.microsoft.clientId ?? "",
      client_secret: config.microsoft.clientSecret ?? "",
      grant_type: "refresh_token",
      scope: SCOPES.join(" "),
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  const d = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token ?? refreshToken,
    expiry: Date.now() + d.expires_in * 1000,
    scope: d.scope,
  };
}

/** Microsoft Graph identity — id + displayName + userPrincipalName/email. */
export async function fetchProfile(accessToken: string): Promise<MicrosoftProfile> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Graph /me failed: ${res.status}`);
  const d = (await res.json()) as {
    id: string;
    displayName?: string;
    userPrincipalName?: string;
    mail?: string;
  };
  const email = d.mail ?? d.userPrincipalName ?? "";
  return { sub: d.id, name: d.displayName ?? email ?? d.id, email };
}

export async function freshAccessToken(tokens: MicrosoftTokens): Promise<MicrosoftTokens> {
  if (tokens.expiry - Date.now() > 60_000) return tokens;
  if (!tokens.refresh_token) return tokens;
  return refreshAccessToken(tokens.refresh_token);
}
