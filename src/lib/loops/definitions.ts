// ============================================================================
// Default loop definitions — the Action Loop Engine ships with these four
// (docs/Forleads_ProductionMarketPlan_v1.md §7). Each produces inspectable
// artifacts and appears in Loop Studio.
//   1. No-contact follow-up
//   2. Stale lead revival
//   3. Buyer watcher
//   4. Listing prep
// ============================================================================

import type { LoopDefinition } from "@/lib/core/types";
import { workspaceSeedId } from "@/lib/db/seed-id";

export function defaultLoops(agentId: string, nowISO: string): LoopDefinition[] {
  return [
    {
      id: workspaceSeedId(agentId, "loop-no-contact"),
      agent_id: agentId,
      name: "No-contact follow-up",
      description:
        "When a field note reads as a no-answer door knock, draft a warm, compliant follow-up and create a retry task.",
      trigger: { event: "note.created", match: { situation: "no_contact" } },
      conditions: [{ kind: "has_contact_channel" }, { kind: "not_opted_out" }],
      actions: [
        { type: "email", template: "warm_followup", requiresApproval: true },
        { type: "task", template: "retry_knock", requiresApproval: false, delayDays: 4 },
      ],
      cadence: { reportDay: "Friday" },
      active: true,
      created_at: nowISO,
      stats: { runs: 0, approved: 0, replies: 0, blocked: 0 },
    },
    {
      id: workspaceSeedId(agentId, "loop-stale-revival"),
      agent_id: agentId,
      name: "Stale lead revival",
      description:
        "When a lead has had no activity for N days and isn't dead/won, draft a low-pressure nurture for batch approval.",
      trigger: { event: "task.due", match: { kind: "stale_check" } },
      conditions: [
        { kind: "has_contact_channel" },
        { kind: "no_activity_days", value: 30 },
        { kind: "status_not_in", value: ["won", "dead"] },
        { kind: "not_opted_out" },
      ],
      actions: [{ type: "email", template: "low_pressure_nurture", requiresApproval: true }],
      cadence: { everyDays: 7, reportDay: "Friday" },
      active: true,
      created_at: nowISO,
      stats: { runs: 0, approved: 0, replies: 0, blocked: 0 },
    },
    {
      id: workspaceSeedId(agentId, "loop-buyer-watcher"),
      agent_id: agentId,
      name: "Buyer watcher",
      description:
        "When a watcher matches a lead surface against buyer criteria, draft a 'found one' message with evidence attached.",
      trigger: { event: "watcher.hit" },
      conditions: [{ kind: "has_evidence" }, { kind: "not_opted_out" }],
      actions: [{ type: "email", template: "found_one", requiresApproval: true }],
      cadence: { reportDay: "Friday" },
      active: true,
      created_at: nowISO,
      stats: { runs: 0, approved: 0, replies: 0, blocked: 0 },
    },
    {
      id: workspaceSeedId(agentId, "loop-listing-prep"),
      agent_id: agentId,
      name: "Listing prep",
      description:
        "When a lead moves to appointment/seller-interested, draft a seller proposal, a CMA checklist note, and a calendar prep hold.",
      trigger: { event: "lead.tapped", match: { status: "appointment" } },
      conditions: [{ kind: "has_evidence" }],
      actions: [
        { type: "email", template: "seller_proposal", requiresApproval: true },
        { type: "crm_note", template: "cma_checklist", requiresApproval: false },
        { type: "calendar", template: "prep_hold", requiresApproval: false },
      ],
      cadence: { reportDay: "Friday" },
      active: true,
      created_at: nowISO,
      stats: { runs: 0, approved: 0, replies: 0, blocked: 0 },
    },
  ];
}
