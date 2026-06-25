import { DEMO_AGENT_ID } from "@/lib/core/config";

/**
 * Stable identity for rows created as part of workspace provisioning.
 *
 * Historical demo rows used global slugs (for example `conn-google`). Preserve
 * those IDs so the production demo workspace is not orphaned, but scope every
 * real tenant's seeded rows by agent ID so primary keys cannot collide.
 */
export function workspaceSeedId(agentId: string, slug: string): string {
  return agentId === DEMO_AGENT_ID ? slug : `${slug}:${agentId}`;
}
