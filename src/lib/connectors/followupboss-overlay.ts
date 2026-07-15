import { loadTenantCredentialRecord } from "@/lib/auth/credentials";
import { nowISO } from "@/lib/core/ids";
import type { LeadSurface, ProviderContactBinding } from "@/lib/core/types";
import { getRepo } from "@/lib/db";
import { addressFingerprint, sameContactIdentity } from "@/lib/contacts/address-match";
import { getConnectorForTenant } from "./index";
import type { FollowUpBossCredential } from "./followupboss";
import type { ConnectorWriteMeta, SyncedConnectorContact } from "./types";

export interface FollowUpBossOverlayResult {
  fetched: number;
  matched: number;
  updated: number;
  unmatched: number;
  ambiguous: number;
  duplicateIds: number;
  complete: boolean;
  nextCursor?: string;
}

function fingerprints(contact: SyncedConnectorContact): Set<string> {
  return new Set(
    contact.addresses
      .map(addressFingerprint)
      .filter((value): value is string => Boolean(value)),
  );
}

function hasIdentity(contact: LeadSurface["contact"]): boolean {
  return Boolean(contact?.name || contact?.email || contact?.phone);
}

export async function syncFollowUpBossOverlay(
  agentId: string,
): Promise<FollowUpBossOverlayResult> {
  const credential = await loadTenantCredentialRecord<FollowUpBossCredential>(agentId, "followupboss");
  if (!credential?.payload.apiKey || !credential.payload.identity) {
    const error = new Error("Test the tenant Follow Up Boss credential before syncing contacts.");
    (error as Error & { status: number }).status = 424;
    throw error;
  }
  const connector = await getConnectorForTenant("followupboss", agentId);
  const meta: ConnectorWriteMeta = {
    idempotencyKey: `fub-sync:${agentId}:complete-snapshot`,
    agentId,
  };
  const batch = await connector.syncContacts(meta);
  if (batch.mode !== "live" || !batch.contacts) {
    const error = new Error("Follow Up Boss contact sync is not live.");
    (error as Error & { status: number }).status = 424;
    throw error;
  }
  if (!batch.complete) {
    const error = new Error(
      "Follow Up Boss account exceeds the safe 500-person snapshot budget. No contacts were changed; staged large-account sync is required.",
    );
    (error as Error & { status: number }).status = 409;
    throw error;
  }

  // Fetch and validate the complete bounded batch before touching persistence.
  const contacts = batch.contacts;
  const repo = await getRepo();
  const leads = await repo.listLeads(agentId);
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const leadsByAddress = new Map<string, LeadSurface[]>();
  for (const lead of leads) {
    const key = addressFingerprint(lead.address);
    if (!key) continue;
    leadsByAddress.set(key, [...(leadsByAddress.get(key) ?? []), lead]);
  }

  const candidates = new Map<string, SyncedConnectorContact[]>();
  let unmatched = 0;
  let ambiguous = 0;
  for (const contact of contacts) {
    const matches = new Map<string, LeadSurface>();
    for (const key of fingerprints(contact)) {
      for (const lead of leadsByAddress.get(key) ?? []) matches.set(lead.id, lead);
    }
    if (matches.size === 0) {
      unmatched += 1;
      continue;
    }
    if (matches.size !== 1) {
      ambiguous += 1;
      continue;
    }
    const lead = [...matches.values()][0]!;
    candidates.set(lead.id, [...(candidates.get(lead.id) ?? []), contact]);
  }

  const identity = credential.payload.identity;
  const bindingOwners = new Map<string, string>();
  for (const lead of leads) {
    const binding = lead.contact?.providerRefs?.followupboss;
    if (binding && binding.workspaceId === identity.workspaceId) {
      bindingOwners.set(binding.contactId, lead.id);
    }
  }

  let matched = 0;
  let updated = 0;
  for (const [leadId, matches] of candidates) {
    if (matches.length !== 1) {
      ambiguous += matches.length;
      continue;
    }
    const lead = leadById.get(leadId)!;
    const person = matches[0]!;
    const existing = lead.contact;
    const priorBinding = existing?.providerRefs?.followupboss;
    const boundElsewhere = bindingOwners.get(person.providerContactId);
    if (boundElsewhere && boundElsewhere !== lead.id) {
      ambiguous += 1;
      continue;
    }
    if (
      priorBinding
      && (
        priorBinding.contactId !== person.providerContactId
        || priorBinding.workspaceId !== identity.workspaceId
        || priorBinding.credentialVersion !== credential.row.version
      )
    ) {
      ambiguous += 1;
      continue;
    }
    if (!priorBinding && hasIdentity(existing) && !sameContactIdentity(existing ?? {}, person)) {
      ambiguous += 1;
      continue;
    }

    matched += 1;
    const syncedAt = nowISO();
    const binding: ProviderContactBinding = {
      contactId: person.providerContactId,
      workspaceId: identity.workspaceId,
      credentialVersion: credential.row.version,
      syncedAt,
    };
    await repo.upsertLead({
      ...lead,
      contact: {
        ...existing,
        name: existing?.name ?? person.name,
        email: existing?.email ?? person.email,
        phone: existing?.phone ?? person.phone,
        source: existing?.source ?? "crm",
        sourceLabel: existing?.sourceLabel ?? "Follow Up Boss · exact CRM contact-address match",
        relationshipBasis: existing?.relationshipBasis,
        verifiedAt: syncedAt,
        emailPermission: existing?.emailPermission ?? "unknown",
        smsPermission: existing?.smsPermission ?? "unknown",
        callPermission: existing?.callPermission ?? "unknown",
        providerRefs: { ...existing?.providerRefs, followupboss: binding },
      },
      last_worked_at: syncedAt,
    });
    bindingOwners.set(person.providerContactId, lead.id);
    updated += 1;
  }

  return {
    fetched: batch.imported,
    matched,
    updated,
    unmatched,
    ambiguous,
    duplicateIds: batch.duplicateIds ?? 0,
    complete: batch.complete ?? false,
    nextCursor: batch.nextCursor,
  };
}
