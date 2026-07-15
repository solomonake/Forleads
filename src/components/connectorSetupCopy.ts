export interface ConnectorSetupStatus {
  authKind: "oauth" | "apiKey" | "webhook" | "unsupported";
  connected: boolean;
  displayName: string;
  availability?: "ready" | "blocked";
  blockedReason?: string;
}

export function connectorSetupCopy(status: ConnectorSetupStatus): string | null {
  if (status.availability === "blocked") {
    return status.blockedReason ?? `${status.displayName} is not ready to connect.`;
  }
  if (status.connected) return null;
  if (status.authKind === "oauth") {
    return `Approvals that need ${status.displayName} stop as setup-required until OAuth is connected.`;
  }
  if (status.authKind === "apiKey") {
    return `Approvals that need ${status.displayName} stop as setup-required until credentials are added.`;
  }
  if (status.authKind === "webhook") {
    return "Approvals that need this webhook stop as setup-required until its URL is configured.";
  }
  return null;
}
