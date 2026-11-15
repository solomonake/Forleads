import { agentIdForSub } from "./agent";
import { loadGoogleCredential } from "./credentials";
import type { Session } from "./session";
import { hasGoogleScope, hasGoogleConnectorScopes, CONNECTOR_SCOPES } from "./google";

export async function googleGrant(session: Session | null) {
  const tokens = session?.googleCredentialRef
    ? await loadGoogleCredential(agentIdForSub(session.sub), session.googleCredentialRef)
    : session?.google;
  return {
    tokens,
    gmail: Boolean(tokens?.access_token && hasGoogleScope(tokens.scope, CONNECTOR_SCOPES[0]!)),
    calendar: Boolean(tokens?.access_token && hasGoogleScope(tokens.scope, CONNECTOR_SCOPES[1]!)),
    connected: Boolean(tokens?.access_token && hasGoogleConnectorScopes(tokens.scope)),
  };
}
