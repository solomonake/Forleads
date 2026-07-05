// Client-facing labels for internal identifiers. Raw enum values
// ("produced_artifact", "crm_note", "no_contact") must never reach the
// screen — every surface renders through these helpers instead.

import type { ActionType, LoopRunStatus } from "@/lib/core/types";

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  email: "Email draft",
  sms: "SMS",
  task: "Task",
  calendar: "Calendar hold",
  crm_note: "CRM note",
};

const LOOP_RUN_STATUS_LABELS: Record<LoopRunStatus, string> = {
  started: "Running",
  skipped_condition: "Skipped — conditions not met",
  produced_artifact: "Prepared work",
  blocked_compliance: "Blocked by guardrail",
  completed: "Completed",
  error: "Failed",
};

export function actionTypeLabel(type: string): string {
  return ACTION_TYPE_LABELS[type as ActionType] ?? humanizeToken(type);
}

export function loopRunStatusLabel(status: string): string {
  return LOOP_RUN_STATUS_LABELS[status as LoopRunStatus] ?? humanizeToken(status);
}

// Generic fallback for identifiers we don't have a curated label for:
// "no_contact" → "no contact", "loop.run.started" → "loop run started",
// "condition:has_contact_channel" → "condition · has contact channel".
export function humanizeToken(value: string): string {
  return value
    .replaceAll(":", " · ")
    .replaceAll(/[._]/g, " ")
    .trim();
}
