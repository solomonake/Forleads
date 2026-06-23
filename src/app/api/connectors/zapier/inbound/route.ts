// POST /api/connectors/zapier/inbound — inbound webhook so external systems can
// emit domain events into Forleads ("Forleads as a platform"). Verifies a shared
// secret; appends an idempotent domain event. (docs/_ProductionMarketPlan_ §6.)
import { NextRequest, NextResponse } from "next/server";
import { config, DEMO_AGENT_ID } from "@/lib/core/config";
import type { DomainEventType } from "@/lib/core/types";
import { emit } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-zapier-secret");
  if (config.zapier.webhookSecret && secret !== config.zapier.webhookSecret) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }
  try {
    const body = (await req.json()) as {
      type?: DomainEventType;
      agentId?: string;
      leadId?: string;
      payload?: Record<string, unknown>;
    };
    const event = await emit(
      body.agentId ?? DEMO_AGENT_ID,
      body.type ?? "watcher.hit",
      body.payload ?? {},
      "zapier-inbound",
      body.leadId
    );
    return NextResponse.json({ ok: true, eventId: event.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
