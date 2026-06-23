// ============================================================================
// Connector registry/factory — selects the right connector per provider and
// per capability, flipping mock⇆live from env. The Connector Hub reads health
// from here. A capability router lets the loop engine say "createTask" without
// knowing which provider serves it.
// ============================================================================

import { config } from "@/lib/core/config";
import type { ActionType, ConnectorProvider } from "@/lib/core/types";
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
}

export function getConnector(provider: ConnectorProvider): Connector {
  switch (provider) {
    case "google":
      return new GmailDraftConnector(googleToken());
    case "microsoft":
      // Outlook draft connector shares the email shape; mock until wired.
      return new MockConnector("microsoft");
    case "followupboss":
      return new FollowUpBossConnector(config.followupboss.apiKey, config.followupboss.baseUrl);
    case "gohighlevel":
      return new GoHighLevelConnector(
        config.gohighlevel.apiKey,
        config.gohighlevel.locationId,
        config.gohighlevel.baseUrl
      );
    case "twilio":
      return new TwilioConnector(
        config.twilio.accountSid,
        config.twilio.authToken,
        config.twilio.fromNumber
      );
    case "zapier":
      return new ZapierWebhookConnector(process.env.ZAPIER_WEBHOOK_URL);
    default:
      return new MockConnector(provider);
  }
}

/** Route an action type to the best available connector. */
export function connectorForAction(type: ActionType, opts?: ConnectorRouteOpts): Connector {
  switch (type) {
    case "email":
      return new GmailDraftConnector(googleToken(opts?.googleAccessToken)); // Gmail drafts — the hero path
    case "calendar":
      return new GoogleCalendarConnector(googleToken(opts?.googleAccessToken));
    case "sms":
      return getConnector("twilio");
    case "crm_note":
    case "task":
      // Prefer a connected CRM; fall back to mock so the loop always completes.
      return config.followupboss.apiKey
        ? getConnector("followupboss")
        : config.gohighlevel.apiKey
          ? getConnector("gohighlevel")
          : new MockConnector("followupboss");
    default:
      return new MockConnector();
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
