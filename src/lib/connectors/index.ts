// ============================================================================
// Connector registry/factory — selects the right connector per provider and
// per capability, flipping mock⇆live from env. The Connector Hub reads health
// from here. A capability router lets the loop engine say "createTask" without
// knowing which provider serves it.
// ============================================================================

import { config } from "@/lib/core/config";
import type { ActionType, ConnectorProvider } from "@/lib/core/types";
import { loadTenantCredential, loadTenantCredentialRecord } from "@/lib/auth/credentials";
import { GoogleCalendarConnector } from "./calendar";
import {
  FollowUpBossConnector,
  type FollowUpBossCredential,
} from "./followupboss";
import { GmailDraftConnector } from "./gmail";
import { GoHighLevelConnector } from "./gohighlevel";
import { MockConnector } from "./mock";
import { OutlookDraftConnector } from "./outlook";
import { TwilioConnector } from "./twilio";
import { ZapierWebhookConnector } from "./zapier";
import { freshAccessToken as microsoftFreshToken, type MicrosoftTokens } from "@/lib/auth/microsoft";
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
        undefined,
        config.followupboss.baseUrl,
        config.allowMockConnectorWrites,
        config.followupboss.systemName,
        config.followupboss.systemKey,
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
    case "microsoft": {
      if (!agentId) {
        return new OutlookDraftConnector(undefined, config.allowMockConnectorWrites);
      }
      // Microsoft tokens are stored as MicrosoftTokens (+ profile) in the
      // per-tenant credential row. Refresh if within 60s of expiry, then
      // persist the fresh access_token back for future calls.
      const raw = await loadTenantCredential<MicrosoftTokens & { profile?: unknown }>(
        agentId,
        "microsoft",
      );
      if (!raw) {
        return new OutlookDraftConnector(undefined, config.allowMockConnectorWrites);
      }
      let tokens: MicrosoftTokens = {
        access_token: raw.access_token,
        refresh_token: raw.refresh_token,
        expiry: raw.expiry,
        scope: raw.scope,
      };
      try {
        tokens = await microsoftFreshToken(tokens);
      } catch {
        // fall through with whatever token we had; the connector will report
        // a 401 upstream if it's expired.
      }
      return new OutlookDraftConnector(tokens.access_token, config.allowMockConnectorWrites);
    }
    case "followupboss": {
      const record = agentId
        ? await loadTenantCredentialRecord<FollowUpBossCredential>(agentId, "followupboss")
        : null;
      return new FollowUpBossConnector(
        record?.payload.apiKey,
        config.followupboss.baseUrl,
        config.allowMockConnectorWrites,
        config.followupboss.systemName,
        config.followupboss.systemKey,
        record?.payload.identity,
        record?.row.version,
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
    case "email": {
      // Prefer whichever mail identity the tenant is signed in with. Google
      // (via signed-in session) wins when present; else Microsoft; else the
      // Gmail mock so the flow still completes.
      if (opts?.googleAccessToken || process.env.GOOGLE_ACCESS_TOKEN) {
        return new GmailDraftConnector(
          googleToken(opts?.googleAccessToken),
          config.allowMockConnectorWrites,
        );
      }
      const msTokens = opts?.agentId
        ? await loadTenantCredential<MicrosoftTokens>(opts.agentId, "microsoft")
        : null;
      if (msTokens?.access_token) {
        return getConnectorForTenant("microsoft", opts?.agentId);
      }
      return new GmailDraftConnector(undefined, config.allowMockConnectorWrites);
    }
    case "calendar": {
      if (opts?.googleAccessToken || process.env.GOOGLE_ACCESS_TOKEN) {
        return new GoogleCalendarConnector(
          googleToken(opts?.googleAccessToken),
          config.allowMockConnectorWrites,
        );
      }
      const msTokens = opts?.agentId
        ? await loadTenantCredential<MicrosoftTokens>(opts.agentId, "microsoft")
        : null;
      if (msTokens?.access_token) {
        return getConnectorForTenant("microsoft", opts?.agentId);
      }
      return new GoogleCalendarConnector(undefined, config.allowMockConnectorWrites);
    }
    case "sms":
      return getConnectorForTenant("twilio", opts?.agentId);
    case "crm_note":
    case "task": {
      // Prefer a connected CRM for THIS tenant; fall back to env. Fails closed
      // downstream when nothing is configured.
      const fub = await tenantApiCreds("followupboss", opts?.agentId);
      if (fub?.apiKey) {
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
