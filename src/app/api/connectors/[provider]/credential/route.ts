// ============================================================================
// PUT /api/connectors/[provider]/credential — save a per-tenant API-key
// credential for the signed-in agent. Encrypted with SESSION_SECRET at rest.
// Refuses to write if the provider isn't in the paste-in schema (OAuth
// providers save credentials from the OAuth callback, not from a form).
//
// DELETE /api/connectors/[provider]/credential — revoke the current agent's
// credential for this provider. Idempotent.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireAgentId } from "@/lib/auth/agent";
import {
  revokeTenantCredential,
  saveTenantCredential,
} from "@/lib/auth/credentials";
import { withRoute } from "@/lib/observability";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { ConnectorProvider } from "@/lib/core/types";
import { parseCredentialPayload } from "@/lib/connectors/credential-schema";

async function readBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

const putHandler = withRoute<{ params: { provider: string } }>(
  "connectors.credential.put",
  async (req, { params }) => {
    const agentId = await requireAgentId();
    if (!agentId) {
      return NextResponse.json({ error: "authentication required" }, { status: 401 });
    }
    const limited = enforceRateLimit(req, {
      name: "connectors.credential",
      agentId,
      perAgent: 30,
      perIp: 60,
    });
    if (limited) return limited;

    const provider = params.provider as ConnectorProvider;
    const payload = parseCredentialPayload(provider, await readBody(req));
    const id = await saveTenantCredential(agentId, provider, payload);
    return NextResponse.json({ id, provider, connected: true });
  },
);

const deleteHandler = withRoute<{ params: { provider: string } }>(
  "connectors.credential.delete",
  async (_req, { params }) => {
    const agentId = await requireAgentId();
    if (!agentId) {
      return NextResponse.json({ error: "authentication required" }, { status: 401 });
    }
    const provider = params.provider as ConnectorProvider;
    const revoked = await revokeTenantCredential(agentId, provider);
    return NextResponse.json({ provider, connected: false, revoked });
  },
);

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  return putHandler(req, { params: await context.params });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  return deleteHandler(req, { params: await context.params });
}
