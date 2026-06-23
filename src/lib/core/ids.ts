import { randomUUID } from "node:crypto";

/** Generate a UUID. Server-side only (uses node:crypto). */
export function uuid(): string {
  return randomUUID();
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
