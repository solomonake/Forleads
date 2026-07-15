// PATCH /api/lead/[id]/contact — set/update the LeadContact fields on a lead
// the caller already owns. Deliberately narrow: known relationship fields and
// permission states only; provider person IDs are internal connector data.
// Address, geometry, and status are handled elsewhere. Tenant-scoped: the
// signed-in agent may only update their own leads.

import { NextRequest, NextResponse } from "next/server";
import { ensureCurrentAgent } from "@/lib/auth/agent";
import { withRoute } from "@/lib/observability";
import { enforceRateLimit } from "@/lib/ratelimit";
import { optStr, validateBody, ValidationError } from "@/lib/validation";
import { getRepo } from "@/lib/db";
import { nowISO } from "@/lib/core/ids";
import {
  CONTACT_PERMISSIONS,
  CONTACT_SOURCES,
  type LeadContact,
  type LeadSurface,
} from "@/lib/core/types";

const contactPatch = withRoute<{ params: { id: string } }>(
  "lead.contact.patch",
  async (req: NextRequest, { params }) => {
    const { id } = params;
    const body = await validateBody(req, (b) => ({
      name: optStr(b, "name", { max: 200 }),
      email: optStr(b, "email", { max: 200 }),
      phone: optStr(b, "phone", { max: 60 }),
      optOutEmail:
        typeof b.optOutEmail === "boolean" ? (b.optOutEmail as boolean) : undefined,
      optOutSms:
        typeof b.optOutSms === "boolean" ? (b.optOutSms as boolean) : undefined,
      source: optStr(b, "source", { allowed: CONTACT_SOURCES }),
      sourceLabel: optStr(b, "sourceLabel", { max: 200 }),
      emailPermission: optStr(b, "emailPermission", { allowed: CONTACT_PERMISSIONS }),
      smsPermission: optStr(b, "smsPermission", { allowed: CONTACT_PERMISSIONS }),
      callPermission: optStr(b, "callPermission", { allowed: CONTACT_PERMISSIONS }),
    }));

    // Same auth policy as the routes that create leads/notes/drafts:
    // demo-workspace mutations allowed only where config permits them.
    const agentId = await ensureCurrentAgent();
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
    if (body.source === "crm" && existing.contact?.source !== "crm") {
      throw new ValidationError("source crm can only be set by a trusted connector import");
    }
    if (existing.contact?.source === "crm" && body.source && body.source !== "crm") {
      throw new ValidationError("a CRM-imported source can only be changed by a trusted connector refresh");
    }

    // Merge: any field the caller omitted keeps its prior value.
    const merged: LeadContact = { ...(existing.contact ?? {}) };
    if (body.name !== undefined) merged.name = body.name || undefined;
    if (body.email !== undefined) merged.email = body.email || undefined;
    if (body.phone !== undefined) merged.phone = body.phone || undefined;
    if (body.source !== undefined) merged.source = body.source;
    if (body.sourceLabel !== undefined) merged.sourceLabel = body.sourceLabel || undefined;
    if (body.emailPermission !== undefined) {
      merged.emailPermission = body.emailPermission;
      merged.optOutEmail = body.emailPermission === "opted_out";
    } else if (body.optOutEmail !== undefined) {
      merged.optOutEmail = body.optOutEmail;
      merged.emailPermission = body.optOutEmail ? "opted_out" : "unknown";
    }
    if (body.smsPermission !== undefined) {
      merged.smsPermission = body.smsPermission;
      merged.optOutSms = body.smsPermission === "opted_out";
    } else if (body.optOutSms !== undefined) {
      merged.optOutSms = body.optOutSms;
      merged.smsPermission = body.optOutSms ? "opted_out" : "unknown";
    }
    if (body.callPermission !== undefined) merged.callPermission = body.callPermission;
    if (!merged.source && (merged.name || merged.email || merged.phone)) merged.source = "agent_entered";
    if (
      [body.emailPermission, body.smsPermission, body.callPermission].includes("allowed")
      && !merged.sourceLabel?.trim()
    ) {
      throw new ValidationError("source detail is required before a channel can be marked allowed");
    }
    if (existing.contact?.source === "crm") {
      merged.source = "crm";
      merged.sourceLabel = existing.contact.sourceLabel;
    }
    merged.verifiedAt = nowISO();

    const updated: LeadSurface = { ...existing, contact: merged, last_worked_at: merged.verifiedAt };
    await repo.upsertLead(updated);
    return NextResponse.json({ lead: updated });
  },
);

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return contactPatch(req, { params: await context.params });
}
