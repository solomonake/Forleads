// ============================================================================
// Tenant identity — the ONE place a route learns whose data it may touch.
// SECURITY: the agent id is derived server-side from the encrypted session
// cookie, NEVER from client-supplied input. Routes must not read `agentId` from
// the request body/query (that was the pre-2026-06 IDOR; see
// .agent/audits/2026-06-23-prod-readiness.md axes 1–3).
// ============================================================================

import { DEMO_AGENT_ID } from "@/lib/core/config";
import { uuidV5 } from "@/lib/core/ids";
import { getSession } from "./session";

/**
 * Stable per-user workspace/agent id derived from the Google subject id.
 * Same user → same agent id, forever, with no lookup table. This is what makes
 * the app multi-tenant: each signed-in user gets their own isolated workspace.
 */
export function agentIdForSub(sub: string): string {
  return uuidV5(`forleads:agent:${sub}`);
}

/** The signed-in user's agent id, or null when unauthenticated. */
export function currentAgentId(): string | null {
  const s = getSession();
  return s ? agentIdForSub(s.sub) : null;
}

/**
 * For MUTATING routes: the caller's agent id, or null → the route must 401.
 * (Same as currentAgentId; named for intent at the call site.)
 */
export function requireAgentId(): string | null {
  return currentAgentId();
}

/**
 * For READ-ONLY routes: the caller's own workspace, or the public read-only DEMO
 * workspace when logged out. Still never trusts client input — a logged-out user
 * can only ever see the seeded demo agent, never an arbitrary tenant.
 */
export function readAgentId(): string {
  return currentAgentId() ?? DEMO_AGENT_ID;
}
