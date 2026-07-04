// ============================================================================
// POST /api/connectors/[provider]/test — cheap round-trip probe to prove the
// saved credential is still live. Never writes; only reads a trivial resource
// (identity/self endpoints where the vendor offers them).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireAgentId } from "@/lib/auth/agent";
import { loadTenantCredential } from "@/lib/auth/credentials";
import { withRoute } from "@/lib/observability";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { ConnectorProvider } from "@/lib/core/types";

interface ProbeResult {
  ok: boolean;
  label?: string;
  error?: string;
}

async function probeFollowUpBoss(creds: { apiKey?: string }): Promise<ProbeResult> {
  if (!creds.apiKey) return { ok: false, error: "No API key saved." };
  try {
    const auth = "Basic " + Buffer.from(`${creds.apiKey}:`).toString("base64");
    const res = await fetch("https://api.followupboss.com/v1/identity", {
      method: "GET",
      headers: { Authorization: auth, Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, error: `FUB probe failed: ${res.status}` };
    const data = (await res.json()) as { name?: string; email?: string };
    return { ok: true, label: data.email ?? data.name ?? "Follow Up Boss account" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

async function probeGoHighLevel(creds: {
  apiKey?: string;
  locationId?: string;
}): Promise<ProbeResult> {
  if (!creds.apiKey || !creds.locationId) {
    return { ok: false, error: "Missing API key or location ID." };
  }
  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/locations/${encodeURIComponent(creds.locationId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${creds.apiKey}`,
          Version: "2021-07-28",
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) return { ok: false, error: `GHL probe failed: ${res.status}` };
    const data = (await res.json()) as { location?: { name?: string } };
    return { ok: true, label: data.location?.name ?? `Location ${creds.locationId}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

async function probeTwilio(creds: {
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
}): Promise<ProbeResult> {
  if (!creds.accountSid || !creds.authToken) {
    return { ok: false, error: "Missing Account SID or Auth Token." };
  }
  try {
    const auth = "Basic " + Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.accountSid)}.json`,
      {
        method: "GET",
        headers: { Authorization: auth, Accept: "application/json" },
      },
    );
    if (!res.ok) return { ok: false, error: `Twilio probe failed: ${res.status}` };
    const data = (await res.json()) as { friendly_name?: string };
    return {
      ok: true,
      label: [data.friendly_name ?? "Twilio account", creds.fromNumber ? `from ${creds.fromNumber}` : null]
        .filter(Boolean)
        .join(" — "),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error." };
  }
}

async function probe(
  provider: ConnectorProvider,
  creds: Record<string, string> | null,
): Promise<ProbeResult> {
  if (!creds) return { ok: false, error: "Not connected." };
  switch (provider) {
    case "followupboss":
      return probeFollowUpBoss(creds);
    case "gohighlevel":
      return probeGoHighLevel(creds);
    case "twilio":
      return probeTwilio(creds);
    default:
      return { ok: false, error: `Test probe not supported for ${provider}.` };
  }
}

const testHandler = withRoute<{ params: { provider: string } }>(
  "connectors.credential.test",
  async (req, { params }) => {
    const agentId = await requireAgentId();
    if (!agentId) {
      return NextResponse.json({ error: "authentication required" }, { status: 401 });
    }
    const limited = enforceRateLimit(req, {
      name: "connectors.test",
      agentId,
      perAgent: 20,
      perIp: 30,
    });
    if (limited) return limited;
    const provider = params.provider as ConnectorProvider;
    const creds = await loadTenantCredential<Record<string, string>>(agentId, provider);
    const result = await probe(provider, creds);
    return NextResponse.json({ provider, ...result });
  },
);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  return testHandler(req, { params: await context.params });
}
