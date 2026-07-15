import { nowISO, uuid } from "@/lib/core/ids";
import { getRepo } from "@/lib/db";
import type { ConnectorCredential, ConnectorProvider } from "@/lib/core/types";
import type { GoogleTokens } from "./session";
import { sealValue, unsealValue } from "./session";

// ---- Generalized per-tenant credential store --------------------------------
// The `connector_credential` table is keyed by (agent_id, provider). It stores
// an opaque encrypted blob so OAuth tokens (Google/Microsoft) and API-key
// bundles (FUB/GHL/Twilio) share the same row shape. Encryption is AES-256-GCM
// via `sealValue`/`unsealValue` and the app's SESSION_SECRET — rotating that
// secret invalidates every stored credential (see .agent/playbook.md).

/** Save (or upgrade) a per-tenant credential. If a live row exists for this
 *  agent+provider, revoke it and write a fresh row with `version` incremented.
 *  Returns the new row's id. */
export async function saveTenantCredential<T>(
  agentId: string,
  provider: ConnectorProvider,
  payload: T,
): Promise<string> {
  const repo = await getRepo();
  const existing = await repo.findConnectorCredential(agentId, provider);
  const now = nowISO();
  const id = uuid();
  if (existing) {
    await repo.upsertConnectorCredential({ ...existing, revoked_at: now, updated_at: now });
  }
  await repo.upsertConnectorCredential({
    id,
    agent_id: agentId,
    provider,
    encrypted_payload: sealValue(payload),
    version: (existing?.version ?? 0) + 1,
    created_at: now,
    updated_at: now,
  });
  return id;
}

/** Load the live credential payload for this tenant+provider, or null. */
export async function loadTenantCredential<T>(
  agentId: string,
  provider: ConnectorProvider,
): Promise<T | null> {
  const repo = await getRepo();
  const row = await repo.findConnectorCredential(agentId, provider);
  if (!row) return null;
  return unsealValue<T>(row.encrypted_payload);
}

export interface TenantCredentialRecord<T> {
  row: ConnectorCredential;
  payload: T;
}

/** Load payload plus immutable credential-generation metadata. Provider
 * bindings record this version so rotating a key cannot silently retarget a
 * provider-local numeric person id into another workspace. */
export async function loadTenantCredentialRecord<T>(
  agentId: string,
  provider: ConnectorProvider,
): Promise<TenantCredentialRecord<T> | null> {
  const row = await (await getRepo()).findConnectorCredential(agentId, provider);
  if (!row) return null;
  const payload = unsealValue<T>(row.encrypted_payload);
  return payload === null ? null : { row, payload };
}

/** Enrich a verified credential in place without creating a new credential
 * generation. Used to persist provider identity after a read-only probe. */
export async function updateTenantCredentialPayload<T>(
  agentId: string,
  provider: ConnectorProvider,
  payload: T,
): Promise<boolean> {
  const repo = await getRepo();
  const row = await repo.findConnectorCredential(agentId, provider);
  if (!row) return false;
  await repo.upsertConnectorCredential({
    ...row,
    encrypted_payload: sealValue(payload),
    updated_at: nowISO(),
  });
  return true;
}

/** Revoke all live credential rows for this tenant+provider (idempotent). */
export async function revokeTenantCredential(
  agentId: string,
  provider: ConnectorProvider,
): Promise<boolean> {
  const repo = await getRepo();
  const revoked = await repo.revokeConnectorCredential(agentId, provider);
  return Boolean(revoked);
}

// ---- Google-specific helpers (preserved for existing OAuth callback) --------
// The Google OAuth flow stores the credential id in the session cookie so a
// browser session can find it back. Other providers (API-key adapters) look
// up by (agent_id, provider) instead and don't need this indirection.

export async function saveGoogleCredential(
  agentId: string,
  tokens: GoogleTokens,
  existingId?: string,
): Promise<string> {
  const repo = await getRepo();
  const id = existingId ?? uuid();
  const existing = existingId ? await repo.getConnectorCredential(existingId) : null;
  const now = nowISO();
  await repo.upsertConnectorCredential({
    id,
    agent_id: agentId,
    provider: "google",
    encrypted_payload: sealValue(tokens),
    version: (existing?.version ?? 0) + 1,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
  return id;
}

export async function loadGoogleCredential(
  agentId: string,
  id: string,
): Promise<GoogleTokens | null> {
  const credential = await (await getRepo()).getConnectorCredential(id);
  if (!credential || credential.agent_id !== agentId || credential.provider !== "google") {
    return null;
  }
  return unsealValue<GoogleTokens>(credential.encrypted_payload);
}
