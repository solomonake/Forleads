// ============================================================================
// Connector registry/factory — selects the right connector per provider and
// per capability, flipping mock⇆live from env. The Connector Hub reads health
// from here. A capability router lets the loop engine say "createTask" without
// knowing which provider serves it.
// ============================================================================

import { config } from "@/lib/core/config";
import type { ActionType, ConnectorProvider } from "@/lib/core/types";
import { loadTenantCredential } from "@/lib/auth/credentials";
import { GoogleCalendarConnector } from "./calendar";
import { FollowUpBossConnector } from "./followupboss";
import { GmailDraftConnector } from "./gmail";
import { GoHighLevelConnector } from "./gohighlevel";
import { MockConnector } from "./mock";
import { TwilioConnector } from "./twilio";
import { ZapierWebhookConnector } from "./zapier";
import type { Connector } from "./types";

// Google tokens come from the signed-in user's encrypted session (preferred),
// or an env token for server-to-server testing, or absent (→ mock).
// Never client-side.
function googleToken(override?: string): string | undefined {
  return override ?? process.env.GOOGLE_ACCESS_TOKEN;
}

export interface ConnectorRouteOpts {
  googleAccessToken?: string;
  /** If provided, per-tenant credentials for the routed provider are used
   *  when present. Falls back to env-based config if the tenant hasn't
   *  connected the provider yet. */
  agentId?: string;
}

/** Load per-tenant creds for a paste-in provider, or null if none. */
async function tenantApiCreds(
  provider: ConnectorProvider,
  agentId: string | undefined,
): Promise<Record<string, string> | null> {
  if (!agentId) return null;
  return loadTenantCredential<Record<string, string>>(agentId, provider);
}

export function getConnector(provider: ConnectorProvider): Connector {
  switch (provider) {
    case "google":
      return new GmailDraftConnector(googleToken(), config.allowMockConnectorWrites);
    case "microsoft":
      // Outlook draft connector shares the email shape; mock until wired.
      return new MockConnector("microsoft", config.allowMockConnectorWrites);
    case "followupboss":
      return new FollowUpBossConnector(
        config.followupboss.apiKey,
        config.followupboss.baseUrl,
        config.allowMockConnectorWrites,
      );
    case "gohighlevel":
      return new GoHighLevelConnector(
        config.gohighlevel.apiKey,
        config.gohighlevel.locationId,
        config.gohighlevel.baseUrl,
        config.allowMockConnectorWrites,
      );
    case "twilio":
      return new TwilioConnector(
        config.twilio.accountSid,
        config.twilio.authToken,
        config.twilio.fromNumber,
        config.allowMockConnectorWrites,
      );
    case "zapier":
      return new ZapierWebhookConnector(
        process.env.ZAPIER_WEBHOOK_URL,
        config.allowMockConnectorWrites,
      );
    default:
      return new MockConnector(provider, config.allowMockConnectorWrites);
  }
}

/** Per-tenant factory. Reads (agent_id, provider) creds where they apply,
 *  falls back to global env config when the tenant hasn't connected yet. */
export async function getConnectorForTenant(
  provider: ConnectorProvider,
  agentId: string | undefined,
): Promise<Connector> {
  switch (provider) {
    case "followupboss": {
      const creds = await tenantApiCreds("followupboss", agentId);
      const apiKey = creds?.apiKey ?? config.followupboss.apiKey;
      return new FollowUpBossConnector(
        apiKey,
        config.followupboss.baseUrl,
        config.allowMockConnectorWrites,
      );
    }
    case "gohighlevel": {
      const creds = await tenantApiCreds("gohighlevel", agentId);
      return new GoHighLevelConnector(
        creds?.apiKey ?? config.gohighlevel.apiKey,
        creds?.locationId ?? config.gohighlevel.locationId,
        config.gohighlevel.baseUrl,
        config.allowMockConnectorWrites,
      );
    }
    case "twilio": {
      const creds = await tenantApiCreds("twilio", agentId);
      return new TwilioConnector(
        creds?.accountSid ?? config.twilio.accountSid,
        creds?.authToken ?? config.twilio.authToken,
        creds?.fromNumber ?? config.twilio.fromNumber,
        config.allowMockConnectorWrites,
      );
    }
    default:
      // Google/microsoft/zapier don't use the paste-in schema; env or OAuth
      // token opts drive them.
      return getConnector(provider);
  }
}

/** Route an action type to the best available connector. Async because
 *  per-tenant credential lookup is a repo read. */
export async function connectorForAction(
  type: ActionType,
  opts?: ConnectorRouteOpts,
): Promise<Connector> {
  switch (type) {
    case "email":
      return new GmailDraftConnector(
        googleToken(opts?.googleAccessToken),
        config.allowMockConnectorWrites,
      ); // Gmail drafts — the hero path
    case "calendar":
      return new GoogleCalendarConnector(
        googleToken(opts?.googleAccessToken),
        config.allowMockConnectorWrites,
      );
    case "sms":
      return getConnectorForTenant("twilio", opts?.agentId);
    case "crm_note":
    case "task": {
      // Prefer a connected CRM for THIS tenant; fall back to env. Fails closed
      // downstream when nothing is configured.
      const fub = await tenantApiCreds("followupboss", opts?.agentId);
      if (fub?.apiKey || config.followupboss.apiKey) {
        return getConnectorForTenant("followupboss", opts?.agentId);
      }
      const ghl = await tenantApiCreds("gohighlevel", opts?.agentId);
      if (ghl?.apiKey || config.gohighlevel.apiKey) {
        return getConnectorForTenant("gohighlevel", opts?.agentId);
      }
      return new MockConnector("followupboss", config.allowMockConnectorWrites);
    }
    default:
      return new MockConnector("google", config.allowMockConnectorWrites);
  }
}

export const ALL_PROVIDERS: ConnectorProvider[] = [
  "google",
  "microsoft",
  "followupboss",
  "gohighlevel",
  "twilio",
  "zapier",
];

export async function allHealth() {
  const seen = new Set<ConnectorProvider>();
  const out = [];
  for (const p of ALL_PROVIDERS) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(await getConnector(p).healthCheck());
  }
  return out;
}

export * from "./types";
export { resetIdempotencyLedger } from "./idempotency";
