import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyStore, InMemoryRepository } from "@/lib/db/repository";
import { saveTenantCredential } from "@/lib/auth/credentials";
import { nowISO } from "@/lib/core/ids";
import type { LeadSurface } from "@/lib/core/types";
import type { Connector, ContactSyncResult } from "./types";

const state = vi.hoisted(() => ({
  repo: undefined as unknown,
  batch: undefined as unknown,
}));

vi.mock("@/lib/db", () => ({ getRepo: async () => state.repo }));
vi.mock("./index", () => ({
  getConnectorForTenant: async () => ({
    provider: "followupboss",
    mode: "live",
    capabilities: ["syncContacts"],
    syncContacts: async () => state.batch,
  }) as unknown as Connector,
}));

import { syncFollowUpBossOverlay } from "./followupboss-overlay";

function repo(): InMemoryRepository {
  return state.repo as InMemoryRepository;
}

function lead(id: string, agentId: string, address: string, contact?: LeadSurface["contact"]): LeadSurface {
  return {
    id,
    agent_id: agentId,
    lng: -97.45,
    lat: 35.64,
    address,
    h3_index: "h3",
    status: "researching",
    contact,
    first_seen_at: nowISO(),
    last_worked_at: nowISO(),
  };
}

function batch(contacts: ContactSyncResult["contacts"]): ContactSyncResult {
  return {
    imported: contacts?.length ?? 0,
    mode: "live",
    contacts,
    complete: true,
    duplicateIds: 0,
  };
}

async function verifiedCredential(agentId = "agent-a") {
  await saveTenantCredential(agentId, "followupboss", {
    apiKey: "fka_test",
    identity: {
      workspaceId: "workspace-7",
      userId: 42,
      label: "agent@example.com",
      verifiedAt: "2026-07-15T12:00:00.000Z",
    },
  });
}

describe("syncFollowUpBossOverlay", () => {
  beforeEach(() => {
    state.repo = new InMemoryRepository(emptyStore());
    state.batch = batch([]);
  });

  it("persists one exact Oklahoma CRM contact match with permission unknown", async () => {
    await verifiedCredential();
    await repo().upsertLead(lead(
      "lead-a",
      "agent-a",
      "2209 Colchester Ter, Edmond, OK 73034, USA",
    ));
    state.batch = batch([{
      provider: "followupboss",
      providerContactId: "123",
      name: "Alex Contact",
      email: "alex@example.com",
      phone: "+1 405 555 0100",
      addresses: ["2209 Colchester Terrace Edmond Oklahoma 73034"],
    }]);

    const result = await syncFollowUpBossOverlay("agent-a");
    expect(result).toMatchObject({ fetched: 1, matched: 1, updated: 1, ambiguous: 0 });
    expect((await repo().getLead("lead-a"))?.contact).toMatchObject({
      name: "Alex Contact",
      source: "crm",
      sourceLabel: "Follow Up Boss · exact CRM contact-address match",
      emailPermission: "unknown",
      smsPermission: "unknown",
      callPermission: "unknown",
      providerRefs: {
        followupboss: {
          contactId: "123",
          workspaceId: "workspace-7",
          credentialVersion: 1,
        },
      },
    });
  });

  it("never touches another tenant even when the address is identical", async () => {
    await verifiedCredential();
    const address = "10 Main St, Tulsa, OK 74103";
    await repo().upsertLead(lead("lead-a", "agent-a", address));
    await repo().upsertLead(lead("lead-b", "agent-b", address));
    state.batch = batch([{
      provider: "followupboss",
      providerContactId: "5",
      name: "Tenant A Person",
      addresses: [address],
    }]);

    await syncFollowUpBossOverlay("agent-a");
    expect((await repo().getLead("lead-a"))?.contact?.name).toBe("Tenant A Person");
    expect((await repo().getLead("lead-b"))?.contact).toBeUndefined();
  });

  it("treats two people at one address as ambiguous and attaches neither", async () => {
    await verifiedCredential();
    const address = "11 Main St, Tulsa, OK 74103";
    await repo().upsertLead(lead("lead-a", "agent-a", address));
    state.batch = batch([
      { provider: "followupboss", providerContactId: "5", name: "One", addresses: [address] },
      { provider: "followupboss", providerContactId: "6", name: "Two", addresses: [address] },
    ]);

    const result = await syncFollowUpBossOverlay("agent-a");
    expect(result).toMatchObject({ updated: 0, ambiguous: 2 });
    expect((await repo().getLead("lead-a"))?.contact).toBeUndefined();
  });

  it("preserves first-party provenance, allowed evidence, and opt-outs on refresh", async () => {
    await verifiedCredential();
    const address = "12 Main St, Tulsa, OK 74103";
    await repo().upsertLead(lead("lead-a", "agent-a", address, {
      name: "Alex",
      email: "alex@example.com",
      source: "first_party",
      sourceLabel: "Past client",
      emailPermission: "allowed",
      smsPermission: "opted_out",
      optOutSms: true,
    }));
    state.batch = batch([{
      provider: "followupboss",
      providerContactId: "8",
      name: "Alex Updated",
      email: "alex@example.com",
      phone: "+1 405 555 0100",
      addresses: [address],
    }]);

    await syncFollowUpBossOverlay("agent-a");
    expect((await repo().getLead("lead-a"))?.contact).toMatchObject({
      name: "Alex",
      source: "first_party",
      sourceLabel: "Past client",
      emailPermission: "allowed",
      smsPermission: "opted_out",
      optOutSms: true,
      providerRefs: { followupboss: { contactId: "8" } },
    });
  });

  it("refuses to merge an unrelated existing contact", async () => {
    await verifiedCredential();
    const address = "13 Main St, Tulsa, OK 74103";
    await repo().upsertLead(lead("lead-a", "agent-a", address, {
      name: "Existing",
      email: "existing@example.com",
      source: "first_party",
    }));
    state.batch = batch([{
      provider: "followupboss",
      providerContactId: "9",
      email: "different@example.com",
      addresses: [address],
    }]);

    const result = await syncFollowUpBossOverlay("agent-a");
    expect(result).toMatchObject({ updated: 0, ambiguous: 1 });
    expect((await repo().getLead("lead-a"))?.contact?.providerRefs).toBeUndefined();
  });

  it("persists nothing when the bounded snapshot is incomplete", async () => {
    await verifiedCredential();
    const address = "14 Main St, Tulsa, OK 74103";
    await repo().upsertLead(lead("lead-a", "agent-a", address));
    state.batch = {
      ...batch([{
        provider: "followupboss",
        providerContactId: "10",
        name: "Later ambiguity unknown",
        addresses: [address],
      }]),
      complete: false,
      nextCursor: "page-6",
    };

    await expect(syncFollowUpBossOverlay("agent-a")).rejects.toThrow(/No contacts were changed/);
    expect((await repo().getLead("lead-a"))?.contact).toBeUndefined();
  });
});
