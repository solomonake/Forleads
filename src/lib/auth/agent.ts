// ============================================================================
// Tenant identity — the ONE place a route learns whose data it may touch.
// SECURITY: the agent id is derived server-side from the encrypted session
// cookie, NEVER from client-supplied input. Routes must not read `agentId` from
// the request body/query (that was the pre-2026-06 IDOR; see
// .agent/audits/2026-06-23-prod-readiness.md axes 1–3).
// ============================================================================

import { DEMO_AGENT_ID } from "@/lib/core/config";
import { deterministicUuid } from "@/lib/core/ids";
import { getRepo } from "@/lib/db";
import { getSession } from "./session";

/**
 * Stable per-user workspace/agent id derived from the Google subject id.
 * Same user → same agent id, forever, with no lookup table. This is what makes
 * the app multi-tenant: each signed-in user gets their own isolated workspace.
 */
export function agentIdForSub(sub: string): string {
  return deterministicUuid(`forleads:agent:${sub}`);
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

/**
 * Production fix (2026-06-24): the OAuth callback writes the per-user agent
 * row once at login. If the Supabase row is wiped (deploy reset, manual
 * delete, fresh project) while the session cookie is still valid, EVERY
 * downstream write fails with `lead_surface_agent_id_fkey` /
 * `report_agent_id_fkey` / etc. — the symptom that nuked production.
 *
 * Defense-in-depth: routes that write per-agent data call this at the top.
 * It JIT-upserts the agent row from the session profile so the FK is always
 * satisfied. Idempotent. Returns the agent id, or null if unauthenticated.
 */
export async function ensureCurrentAgent(): Promise<string | null> {
  const s = getSession();
  if (!s) return null;
  const id = agentIdForSub(s.sub);
  const repo = await getRepo();
  const existing = await repo.getAgent(id);
  if (existing) return id;
  await repo.upsertAgent({
    id,
    name: s.name,
    email: s.email,
    signatureHtml: `<p>${s.name} · ${s.email}</p>`,
    brandVoice: s.brandVoice ?? "warm_local",
    locale: "en-US",
    mode: "crm",
  });
  return id;
}

/**
 * Read-side variant: if the user is signed in, JIT-ensure their agent row
 * exists before returning the id. Falls back to the seeded DEMO workspace
 * for anonymous reads. Keep the call async so routes can `await` it.
 */
export async function readAgentIdEnsured(): Promise<string> {
  const ensured = await ensureCurrentAgent();
  return ensured ?? DEMO_AGENT_ID;
}
