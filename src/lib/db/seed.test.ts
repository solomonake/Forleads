import { describe, expect, it } from "vitest";
import type { Agent } from "@/lib/core/types";
import { ALL_PROVIDERS } from "@/lib/connectors";
import { DEMO_AGENT, provisionWorkspace } from "./seed";
import { workspaceSeedId } from "./seed-id";
import { emptyStore, InMemoryRepository } from "./repository";

const user = (id: string, email: string): Agent => ({
  id,
  name: email.split("@")[0]!,
  email,
  signatureHtml: `<p>${email}</p>`,
  brandVoice: "warm_local",
  locale: "en-US",
  mode: "crm",
});

describe("workspace provisioning identities", () => {
  it("keeps seeded loops and connector accounts isolated across tenants", async () => {
    const repo = new InMemoryRepository(emptyStore());
    const first = user("11111111-1111-4111-8111-111111111111", "first@example.com");
    const second = user("22222222-2222-4222-8222-222222222222", "second@example.com");

    await provisionWorkspace(repo, DEMO_AGENT);
    await provisionWorkspace(repo, first);
    await provisionWorkspace(repo, second);
    await provisionWorkspace(repo, first);

    const workspaces = [DEMO_AGENT, first, second];
    const loopIds = new Set<string>();
    const connectorIds = new Set<string>();

    for (const agent of workspaces) {
      const loops = await repo.listLoopDefs(agent.id);
      const connectors = await repo.listConnectorAccounts(agent.id);

      expect(loops).toHaveLength(4);
      expect(connectors).toHaveLength(ALL_PROVIDERS.length);
      loops.forEach((loop) => loopIds.add(loop.id));
      connectors.forEach((connector) => connectorIds.add(connector.id));
    }

    expect(loopIds).toHaveLength(workspaces.length * 4);
    expect(connectorIds).toHaveLength(workspaces.length * ALL_PROVIDERS.length);
  });

  it("preserves legacy demo slugs while scoping real workspace rows", () => {
    expect(workspaceSeedId(DEMO_AGENT.id, "conn-google")).toBe("conn-google");
    expect(workspaceSeedId("user-agent-id", "conn-google")).toBe(
      "conn-google:user-agent-id",
    );
  });
});
