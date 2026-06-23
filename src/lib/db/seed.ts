// ============================================================================
// Seed — the demo agent, default loops, and connector accounts. Runs once into
// the in-memory store so the app is alive on first load (no signup required).
// ============================================================================

import { DEMO_AGENT_ID } from "@/lib/core/config";
import { nowISO } from "@/lib/core/ids";
import type { Agent, ConnectorAccount } from "@/lib/core/types";
import { ALL_PROVIDERS, getConnector } from "@/lib/connectors";
import { defaultLoops } from "@/lib/loops/definitions";
import type { Repository } from "./repository";

export const DEMO_AGENT: Agent = {
  id: DEMO_AGENT_ID,
  name: "Marcus Lee",
  email: "marcus@forleads.app",
  signatureHtml: "<p>Marcus Lee · Forleads Realty · marcus@forleads.app</p>",
  brandVoice: "warm_local",
  locale: "en-US",
  mode: "crm",
};

export async function seed(repo: Repository): Promise<void> {
  await repo.upsertAgent(DEMO_AGENT);

  for (const loop of defaultLoops(DEMO_AGENT_ID, nowISO())) {
    await repo.upsertLoopDef(loop);
  }

  for (const provider of ALL_PROVIDERS) {
    const health = await getConnector(provider).healthCheck();
    const account: ConnectorAccount = {
      id: `conn-${provider}`,
      agent_id: DEMO_AGENT_ID,
      provider,
      scopes:
        provider === "google"
          ? ["gmail.compose", "calendar.events"]
          : provider === "followupboss"
            ? ["people:read", "notes:write", "tasks:write"]
            : [],
      status: health.mode === "live" ? "connected" : provider === "twilio" ? "needs_setup" : "mock",
      credentials_ref: `vault://${provider}/${DEMO_AGENT_ID}`,
      capabilities: health.capabilities,
      last_healthcheck_at: nowISO(),
      created_at: nowISO(),
    };
    await repo.upsertConnectorAccount(account);
  }
}
