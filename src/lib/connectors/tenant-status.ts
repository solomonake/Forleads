// ============================================================================
// Per-tenant connector status for the Connector Hub. This is the shape the UI
// renders: connected / not-connected per (agent, provider), with the info
// needed to render either the OAuth Connect button or the paste-in modal.
// ============================================================================

import { loadTenantCredential } from "@/lib/auth/credentials";
import type { ConnectorProvider } from "@/lib/core/types";
import { CREDENTIAL_SCHEMAS, type CredentialField } from "./credential-schema";
import { ALL_PROVIDERS } from "./index";
import { config } from "@/lib/core/config";
import type { FollowUpBossCredential } from "./followupboss";

export interface TenantConnectorStatus {
  provider: ConnectorProvider;
  displayName: string;
  summary: string;
  authKind: "oauth" | "apiKey" | "webhook" | "unsupported";
  availability: "ready" | "blocked";
  blockedReason?: string;
  /** Whether THIS agent has connected the provider. */
  connected: boolean;
  /** Best available label (e.g. connected email address, saved location id). */
  connectedLabel?: string;
  credentialVerified?: boolean;
  /** Capabilities the connector exposes when live. */
  capabilities: string[];
  /** OAuth-scope strings (or read-only descriptors for API-key providers). */
  scopes?: string[];
  /** Deep link to obtain the credential (docs, provider dashboard). */
  docsUrl?: string;
  /** For API-key providers, the fields the paste-in modal must render. */
  fields?: CredentialField[];
  /** For OAuth providers, the URL the Connect button should hit. */
  connectUrl?: string;
}

const DISPLAY: Record<
  ConnectorProvider,
  { displayName: string; summary: string; capabilities: string[]; scopes?: string[] }
> = {
  google: {
    displayName: "Google Workspace · Gmail drafts + Calendar",
    summary: "Draft outreach in your Gmail account and hold time in your Google Calendar.",
    capabilities: ["createDraft", "updateDraft", "createCalendarEvent"],
    scopes: ["gmail.compose", "calendar.events"],
  },
  microsoft: {
    displayName: "Microsoft 365 · Outlook + Calendar",
    summary: "Draft outreach in Outlook and hold time in your Microsoft 365 calendar.",
    capabilities: ["createDraft", "updateDraft", "createCalendarEvent"],
    scopes: ["Mail.ReadWrite", "Calendars.ReadWrite"],
  },
  followupboss: {
    displayName: "Follow Up Boss · CRM",
    summary: "Sync exact CRM contact-address matches and write person-bound notes and tasks after approval.",
    capabilities: ["writeCrmNote", "createTask", "syncContacts"],
  },
  gohighlevel: {
    displayName: "GoHighLevel · CRM / agencies",
    summary: "Write CRM notes, tasks, and contact syncs to your GHL location after approval.",
    capabilities: ["writeCrmNote", "createTask", "syncContacts"],
  },
  twilio: {
    displayName: "Twilio · SMS (approved only)",
    summary: "Send approved SMS to contacts who have opted in.",
    capabilities: ["sendSms"],
  },
  zapier: {
    displayName: "Zapier / Webhooks",
    summary: "Emit approved actions as outbound webhooks to any Zapier trigger.",
    capabilities: ["writeCrmNote", "createTask"],
  },
};

const BLOCKED: Partial<Record<ConnectorProvider, string>> = {
  microsoft:
    "Microsoft onboarding is paused until refreshed OAuth tokens are persisted and reconnect behavior is verified.",
  gohighlevel:
    "GoHighLevel onboarding is paused until contact import persists provider IDs and note/task calls use contact-bound endpoints.",
  twilio:
    "SMS onboarding is paused until durable consent, STOP/DNC, quiet-hours, sender-scope, A2P, and delivery-status gates are implemented.",
};

async function statusFor(
  provider: ConnectorProvider,
  agentId: string,
  googleConnected: boolean,
): Promise<TenantConnectorStatus> {
  const meta = DISPLAY[provider];
  const schema = CREDENTIAL_SCHEMAS[provider];

  if (provider === "google") {
    return {
      provider,
      displayName: meta.displayName,
      summary: meta.summary,
      authKind: "oauth",
      availability: "ready",
      connected: googleConnected,
      capabilities: meta.capabilities,
      scopes: meta.scopes,
      connectUrl: "/api/auth/google/login",
    };
  }
  if (provider === "microsoft") {
    const raw = await loadTenantCredential<{
      access_token?: string;
      profile?: { email?: string; name?: string };
    }>(agentId, "microsoft");
    const connected = Boolean(raw?.access_token);
    const label = raw?.profile?.email ?? raw?.profile?.name;
    return {
      provider,
      displayName: meta.displayName,
      summary: meta.summary,
      authKind: "oauth",
      availability: "blocked",
      blockedReason: BLOCKED.microsoft,
      connected,
      connectedLabel: connected && label ? label : undefined,
      capabilities: meta.capabilities,
      scopes: meta.scopes,
      connectUrl: "/api/auth/microsoft/login",
    };
  }
  if (provider === "zapier") {
    return {
      provider,
      displayName: meta.displayName,
      summary: meta.summary,
      authKind: "webhook",
      availability: "ready",
      connected: Boolean(process.env.ZAPIER_WEBHOOK_URL),
      capabilities: meta.capabilities,
    };
  }
  if (schema) {
    const creds = await loadTenantCredential<Record<string, string> & FollowUpBossCredential>(agentId, provider);
    const connected = Boolean(creds);
    // Best-available label: locationId for GHL, fromNumber for Twilio, and
    // "Connected" otherwise — the /test endpoint returns a friendlier label
    // when the paid probe succeeds.
    let connectedLabel: string | undefined;
    if (connected && creds) {
      if (provider === "gohighlevel" && creds.locationId) {
        connectedLabel = `Location ${creds.locationId}`;
      } else if (provider === "twilio" && creds.fromNumber) {
        connectedLabel = `from ${creds.fromNumber}`;
      } else if (provider === "followupboss" && creds.identity?.label) {
        connectedLabel = creds.identity.label;
      } else {
        connectedLabel = "Credential saved";
      }
    }
    const dynamicBlocked = provider === "followupboss"
      && (!config.followupboss.systemName || !config.followupboss.systemKey)
      ? "Register Forleads with Follow Up Boss and deploy the issued X-System credentials before adding customer API keys."
      : BLOCKED[provider];
    return {
      provider,
      displayName: schema.displayName ?? meta.displayName,
      summary: schema.summary ?? meta.summary,
      authKind: "apiKey",
      availability: dynamicBlocked ? "blocked" : "ready",
      blockedReason: dynamicBlocked,
      connected,
      connectedLabel,
      credentialVerified: provider === "followupboss" ? Boolean(creds?.identity) : undefined,
      capabilities: meta.capabilities,
      docsUrl: schema.docsUrl,
      fields: schema.fields,
    };
  }
  return {
    provider,
    displayName: meta.displayName,
    summary: meta.summary,
    authKind: "unsupported",
    availability: "blocked",
    blockedReason: "This connector has no implemented setup path.",
    connected: false,
    capabilities: meta.capabilities,
  };
}

export async function tenantConnectorStatuses(
  agentId: string,
  googleConnected: boolean,
): Promise<TenantConnectorStatus[]> {
  return Promise.all(
    ALL_PROVIDERS.map((p) => statusFor(p, agentId, googleConnected)),
  );
}
