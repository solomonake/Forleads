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
import { workspaceSeedId } from "./seed-id";

export const DEMO_AGENT: Agent = {
  id: DEMO_AGENT_ID,
  name: "Marcus Lee",
  email: "marcus@forleads.app",
  signatureHtml: "<p>Marcus Lee · Forleads Realty · marcus@forleads.app</p>",
  brandVoice: "warm_local",
  locale: "en-US",
  mode: "crm",
};

export async function provisionWorkspace(repo: Repository, agent: Agent): Promise<void> {
  await repo.upsertAgent(agent);

  const existingLoops = await repo.listLoopDefs(agent.id);
  if (existingLoops.length === 0) {
    for (const loop of defaultLoops(agent.id, nowISO())) {
      await repo.upsertLoopDef(loop);
    }
  }

  const existingConnectors = await repo.listConnectorAccounts(agent.id);
  const connected = new Set(existingConnectors.map((account) => account.provider));
  for (const provider of ALL_PROVIDERS) {
    if (connected.has(provider)) continue;
    const health = await getConnector(provider).healthCheck();
    const account: ConnectorAccount = {
      id: workspaceSeedId(agent.id, `conn-${provider}`),
      agent_id: agent.id,
      provider,
      scopes:
        provider === "google"
          ? ["gmail.compose", "calendar.events"]
          : provider === "followupboss"
            ? ["people:read", "notes:write", "tasks:write"]
            : [],
      status:
        health.mode === "live"
          ? "connected"
          : health.healthy
            ? "mock"
            : "needs_setup",
      credentials_ref: `vault://${provider}/${agent.id}`,
      capabilities: health.capabilities,
      last_healthcheck_at: nowISO(),
      created_at: nowISO(),
    };
    await repo.upsertConnectorAccount(account);
  }
}

export async function seed(repo: Repository): Promise<void> {
  await provisionWorkspace(repo, DEMO_AGENT);
}
