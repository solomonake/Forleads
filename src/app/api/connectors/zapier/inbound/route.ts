// POST /api/connectors/zapier/inbound — inbound webhook so external systems can
// emit domain events into Forleads ("Forleads as a platform"). Verifies a shared
// secret; appends an idempotent domain event. (docs/_ProductionMarketPlan_ §6.)
import { NextRequest, NextResponse } from "next/server";
import { withRoute } from "@/lib/observability";
import { config, DEMO_AGENT_ID } from "@/lib/core/config";
import type { DomainEventType } from "@/lib/core/types";
import { emit } from "@/lib/pipeline";

export const POST = withRoute("zapier.inbound", async (req: NextRequest) => {
  // Fail closed: an unconfigured secret means the webhook is NOT ready to accept
  // events, not "accept anything". Reject until ZAPIER_WEBHOOK_SECRET is set.
  if (!config.zapier.webhookSecret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }
  const secret = req.headers.get("x-zapier-secret");
  if (secret !== config.zapier.webhookSecret) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }
  const idempotencyKey = req.headers.get("x-idempotency-key");
  if (!idempotencyKey) {
    return NextResponse.json({ error: "x-idempotency-key required" }, { status: 400 });
  }
  const body = (await req.json()) as {
    type?: DomainEventType;
    leadId?: string;
    payload?: Record<string, unknown>;
  };
  // The agent is NOT read from the request body (that was an IDOR). Inbound
  // platform events land in the workspace bound to the configured secret —
  // the default workspace until a per-secret agent map exists.
  const event = await emit(
    DEMO_AGENT_ID,
    body.type ?? "watcher.hit",
    body.payload ?? {},
    "zapier-inbound",
    body.leadId,
    idempotencyKey,
  );
  return NextResponse.json({ ok: true, eventId: event.id, idempotencyKey });
});
