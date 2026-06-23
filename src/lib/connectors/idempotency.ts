// ============================================================================
// Idempotency ledger — guarantees connector writes are not duplicated on retry
// (docs/Forleads_ProductionMarketPlan_v1.md §10). In-memory for the local build;
// back this with a `connector_write(idempotency_key UNIQUE)` row in Postgres.
// ============================================================================

import type { ConnectorResult } from "./types";

const ledger = new Map<string, ConnectorResult>();

/**
 * Run `write` exactly once per idempotency key. If the key was seen, return the
 * cached result marked `deduped: true` — NO new side effect is performed.
 */
export async function once(
  key: string,
  write: () => Promise<ConnectorResult>
): Promise<ConnectorResult> {
  const prior = ledger.get(key);
  if (prior) {
    return { ...prior, deduped: true };
  }
  const result = await write();
  // Only record successful writes so a transient failure can be retried.
  if (result.ok) ledger.set(key, result);
  return result;
}

/** Test/util: clear the ledger. */
export function resetIdempotencyLedger(): void {
  ledger.clear();
}

export function ledgerSize(): number {
  return ledger.size;
}
