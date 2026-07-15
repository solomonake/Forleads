// ============================================================================
// tenant-connector.test.ts — the connector factory must pick up per-tenant
// credentials before env fallbacks. The point of the refactor: agent A's FUB
// key gets used when agent A approves an artifact, without leaking to agent B.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyStore, InMemoryRepository } from "@/lib/db/repository";
import { saveTenantCredential } from "@/lib/auth/credentials";
import { getConnectorForTenant, connectorForAction } from "./index";
import { FollowUpBossConnector } from "./followupboss";

const state = vi.hoisted(() => ({
  repo: undefined as unknown,
}));

vi.mock("@/lib/db", () => ({
  getRepo: async () => state.repo,
}));

beforeEach(() => {
  state.repo = new InMemoryRepository(emptyStore());
});

describe("getConnectorForTenant", () => {
  it("loads this agent's saved FUB key without claiming the capability is live", async () => {
    await saveTenantCredential("agent-a", "followupboss", { apiKey: "per_tenant_key" });
    const connector = (await getConnectorForTenant(
      "followupboss",
      "agent-a",
    )) as FollowUpBossConnector;
    // An API key is configuration evidence, not capability proof. The
    // connector stays mock until the registered system headers and a verified
    // workspace/user identity are present as well.
    expect(connector.mode).toBe("mock");
    expect((connector as unknown as { apiKey: string }).apiKey).toBe("per_tenant_key");
  });

  it("does not leak agent A's key to agent B", async () => {
    await saveTenantCredential("agent-a", "followupboss", { apiKey: "a_key" });
    const connector = (await getConnectorForTenant(
      "followupboss",
      "agent-b",
    )) as FollowUpBossConnector;
    expect((connector as unknown as { apiKey: string | undefined }).apiKey).toBeUndefined();
    expect(connector.mode).toBe("mock");
  });

  it("does not fall back to a global env key in multi-tenant mode", async () => {
    const prev = process.env.FOLLOWUPBOSS_API_KEY;
    process.env.FOLLOWUPBOSS_API_KEY = "env_default";
    try {
      const connector = (await getConnectorForTenant(
        "followupboss",
        "agent-c",
      )) as FollowUpBossConnector;
      expect(connector).toBeInstanceOf(FollowUpBossConnector);
      expect((connector as unknown as { apiKey: string | undefined }).apiKey).toBeUndefined();
      expect(connector.mode).toBe("mock");
    } finally {
      if (prev === undefined) delete process.env.FOLLOWUPBOSS_API_KEY;
      else process.env.FOLLOWUPBOSS_API_KEY = prev;
    }
  });
});

describe("connectorForAction — tenant routing", () => {
  it("routes crm_note to the agent's connected FUB when present", async () => {
    await saveTenantCredential("agent-a", "followupboss", { apiKey: "a_key" });
    const connector = await connectorForAction("crm_note", { agentId: "agent-a" });
    expect(connector).toBeInstanceOf(FollowUpBossConnector);
    expect((connector as unknown as { apiKey: string }).apiKey).toBe("a_key");
  });
});
