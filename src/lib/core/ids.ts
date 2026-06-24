import { createHash, randomUUID } from "node:crypto";

/** Generate a UUID. Server-side only (uses node:crypto). */
export function uuid(): string {
  return randomUUID();
}

// RFC 4122 URL namespace — fixed so the same name always yields the same uuid.
const UUID_NS = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");

/**
 * Deterministic RFC-4122 v5 UUID from an arbitrary name. Same name → same uuid,
 * forever. Used to map stable external ids (a Google `sub`, a seed slug) onto a
 * uuid PK without a lookup table. (Single source of truth; supabase-repo + auth
 * both call this so their outputs never drift.)
 */
export function uuidV5(name: string): string {
  const b = Buffer.from(createHash("sha1").update(UUID_NS).update(name).digest().subarray(0, 16));
  b.writeUInt8((b.readUInt8(6) & 0x0f) | 0x50, 6); // version 5
  b.writeUInt8((b.readUInt8(8) & 0x3f) | 0x80, 8); // RFC 4122 variant
  const x = b.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/**
 * Deterministic idempotency key for connector writes. Same logical action
 * produces the same key, so retries never duplicate side effects.
 * (docs/Forleads_ProductionMarketPlan_v1.md §10)
 */
export function idempotencyKey(parts: (string | number | undefined)[]): string {
  const basis = parts.filter((p) => p !== undefined).join("|");
  // FNV-1a — small, dependency-free, stable.
  let hash = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return "idem_" + (hash >>> 0).toString(16).padStart(8, "0");
}

export function nowISO(): string {
  return new Date().toISOString();
}
