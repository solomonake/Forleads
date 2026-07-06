// PATCH /api/lead/[id]/status — move a lead the caller owns to another stage.
// Powers the Pipeline archive (status "dead") and its undo. Same auth policy
// as the other tenant-write routes; tenant-scoped with a non-leaking 404.

import { NextRequest, NextResponse } from "next/server";
import { ensureCurrentAgent } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { enforceRateLimit } from "@/lib/ratelimit";
import { str, validateBody } from "@/lib/validation";
import { getRepo } from "@/lib/db";
import { nowISO } from "@/lib/core/ids";
import type { LeadStatus } from "@/lib/core/types";

const ALLOWED: LeadStatus[] = [
  "new",
  "researching",
  "contacted",
  "nurturing",
  "appointment",
  "won",
  "dead",
];

const statusPatch = withRoute<{ params: { id: string } }>(
  "lead.status.patch",
  async (req: NextRequest, { params }) => {
    const { id } = params;
    const body = await validateBody(req, (b) => ({
      status: str(b, "status", { max: 30 }),
    }));
    if (!ALLOWED.includes(body.status as LeadStatus)) {
      return NextResponse.json({ error: "unknown status" }, { status: 400 });
    }

    const agentId = await ensureCurrentAgent();
    if (!agentId) {
      return NextResponse.json({ error: "authentication required" }, { status: 401 });
    }
    const limited = enforceRateLimit(req, {
      name: "lead.status",
      agentId,
      perAgent: 60,
      perIp: 90,
    });
    if (limited) return limited;

    const repo = await getRepo();
    const existing = await repo.getLead(id);
    if (!existing || existing.agent_id !== agentId) {
      // Same "not found" for missing and cross-tenant — never leak existence.
      return NextResponse.json({ error: "lead not found" }, { status: 404 });
    }

    const lead = await repo.upsertLead({
      ...existing,
      status: body.status as LeadStatus,
      last_worked_at: nowISO(),
    });
    return NextResponse.json({ lead });
  },
);

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return statusPatch(req, { params: await context.params });
}
