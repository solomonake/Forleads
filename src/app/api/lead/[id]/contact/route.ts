// PATCH /api/lead/[id]/contact — set/update the LeadContact fields on a lead
// the caller already owns. Deliberately narrow: only name/email/phone/opt-outs;
// address, geometry, and status are handled elsewhere. Tenant-scoped: the
// signed-in agent may only update their own leads.

import { NextRequest, NextResponse } from "next/server";
import { requireAgentId } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { enforceRateLimit } from "@/lib/ratelimit";
import { optStr, validateBody } from "@/lib/validation";
import { getRepo } from "@/lib/db";
import { nowISO } from "@/lib/core/ids";
import type { LeadContact, LeadSurface } from "@/lib/core/types";

export const PATCH = withRoute(
  "lead.contact.patch",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const body = await validateBody(req, (b) => ({
      name: optStr(b, "name", { max: 200 }),
      email: optStr(b, "email", { max: 200 }),
      phone: optStr(b, "phone", { max: 60 }),
      optOutEmail:
        typeof b.optOutEmail === "boolean" ? (b.optOutEmail as boolean) : undefined,
      optOutSms:
        typeof b.optOutSms === "boolean" ? (b.optOutSms as boolean) : undefined,
    }));

    const agentId = await requireAgentId();
    if (!agentId) {
      return NextResponse.json({ error: "authentication required" }, { status: 401 });
    }
    const limited = enforceRateLimit(req, {
      name: "lead.contact",
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

    // Merge: any field the caller omitted keeps its prior value.
    const merged: LeadContact = { ...(existing.contact ?? {}) };
    if (body.name !== undefined) merged.name = body.name || undefined;
    if (body.email !== undefined) merged.email = body.email || undefined;
    if (body.phone !== undefined) merged.phone = body.phone || undefined;
    if (body.optOutEmail !== undefined) merged.optOutEmail = body.optOutEmail;
    if (body.optOutSms !== undefined) merged.optOutSms = body.optOutSms;

    const updated: LeadSurface = { ...existing, contact: merged, last_worked_at: nowISO() };
    await repo.upsertLead(updated);
    return NextResponse.json({ lead: updated });
  },
);
