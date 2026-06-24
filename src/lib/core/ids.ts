import { createHash, randomUUID } from "node:crypto";

/** Generate a UUID. Server-side only (uses node:crypto). */
export function uuid(): string {
  return randomUUID();
}

// RFC 4122 URL namespace — fixed so the same name always yields the same uuid.
const UUID_NS = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");

function formatUuid(bytes: Buffer, version: number): string {
  const b = Buffer.from(bytes.subarray(0, 16));
  b.writeUInt8((b.readUInt8(6) & 0x0f) | (version << 4), 6);
  b.writeUInt8((b.readUInt8(8) & 0x3f) | 0x80, 8); // RFC 4122 variant
  const x = b.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/**
 * Deterministic RFC-4122 v5 UUID (SHA-1) from a name. RESERVED for stable
 * INTERNAL slugs (seed ids like `loop-no-contact`) whose derived uuids are
 * already persisted — changing the algorithm here would orphan those rows. Do
 * NOT feed user-derived input here; use deterministicUuid() for that.
 */
export function uuidV5(name: string): string {
  return formatUuid(createHash("sha1").update(UUID_NS).update(name).digest(), 5);
}

/**
 * Deterministic, RFC-4122-formatted UUID from an arbitrary (possibly
 * user-derived) name, using SHA-256 — a modern digest with no weak-crypto
 * baggage. Same name → same uuid, forever, with no lookup table. Use this to map
 * external identities (a Google `sub`) onto a uuid workspace key.
 */
export function deterministicUuid(name: string): string {
  return formatUuid(createHash("sha256").update(UUID_NS).update(name).digest(), 8);
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
