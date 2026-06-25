import { nowISO, uuid } from "@/lib/core/ids";
import { getRepo } from "@/lib/db";
import type { GoogleTokens } from "./session";
import { sealValue, unsealValue } from "./session";

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
