// ============================================================================
// Action Loop Engine — durable loop runner (docs/_ProductionMarketPlan_ §5/§7).
// Evaluates conditions, produces inspectable artifacts via the pipeline, and
// LOGS EVERY RUN with a planner_trace. No auto-send: artifacts land as drafts
// in the Action Inbox/Review Tray for human approval.
// ============================================================================

import { nowISO, uuid } from "@/lib/core/ids";
import type {
  Artifact,
  EvidenceCard,
  LeadSurface,
  LoopCondition,
  LoopDefinition,
  LoopRun,
  LoopRunStep,
  Situation,
} from "@/lib/core/types";
import { getRepo } from "@/lib/db";
import { DEMO_AGENT } from "@/lib/db/seed";
import { draftArtifact } from "@/lib/pipeline";

export interface LoopContext {
  lead: LeadSurface;
  situation?: Situation;
  situationConfidence?: number;
  evidence: EvidenceCard[];
  triggerSource: string;
}

function evalCondition(c: LoopCondition, ctx: LoopContext): { pass: boolean; detail: string } {
  switch (c.kind) {
    case "has_contact_channel": {
      const ok = Boolean(ctx.lead.contact?.email || ctx.lead.contact?.phone);
      return { pass: ok, detail: ok ? "Lead has an email/phone channel." : "No contact channel — skipping." };
    }
    case "not_opted_out": {
      const opted = ctx.lead.contact?.optOutEmail || ctx.lead.contact?.optOutSms;
      return { pass: !opted, detail: opted ? "Lead opted out — skipping." : "Lead has not opted out." };
    }
    case "status_not_in": {
      const list = (c.value as string[]) ?? [];
      const ok = !list.includes(ctx.lead.status);
      return { pass: ok, detail: ok ? `Status '${ctx.lead.status}' not in [${list.join(",")}].` : `Status '${ctx.lead.status}' excluded.` };
    }
    case "status_in": {
      const list = (c.value as string[]) ?? [];
      const ok = list.includes(ctx.lead.status);
      return { pass: ok, detail: ok ? `Status '${ctx.lead.status}' matches.` : `Status '${ctx.lead.status}' not in target set.` };
    }
    case "has_evidence": {
      const ok = ctx.evidence.some((e) => e.confidence !== "D");
      return { pass: ok, detail: ok ? "Grounded evidence present." : "No grounded evidence yet — skipping." };
    }
    case "no_activity_days": {
      const days = (c.value as number) ?? 30;
      const last = new Date(ctx.lead.last_worked_at).getTime();
      const ageDays = (Date.now() - last) / 86400000;
      const ok = ageDays >= days;
      return { pass: ok, detail: `Last worked ${ageDays.toFixed(1)}d ago (threshold ${days}d).` };
    }
    default:
      return { pass: true, detail: "Unknown condition — defaulting to pass." };
  }
}

export async function runLoop(def: LoopDefinition, ctx: LoopContext): Promise<LoopRun> {
  const repo = await getRepo();
  const steps: LoopRunStep[] = [];
  const artifactIds: string[] = [];
  const runId = uuid();

  steps.push({ at: nowISO(), stage: "trigger", detail: `Triggered by ${def.trigger.event} via ${ctx.triggerSource}.`, outcome: "info" });

  // Evaluate conditions — fail fast on the first that doesn't pass.
  for (const cond of def.conditions) {
    const r = evalCondition(cond, ctx);
    steps.push({ at: nowISO(), stage: `condition:${cond.kind}`, detail: r.detail, outcome: r.pass ? "pass" : "fail" });
    if (!r.pass) {
      const run: LoopRun = {
        id: runId,
        loop_definition_id: def.id,
        agent_id: def.agent_id,
        lead_surface_id: ctx.lead.id,
        status: "skipped_condition",
        planner_trace: steps,
        artifact_ids: [],
        started_at: steps[0]!.at,
        completed_at: nowISO(),
      };
      await repo.saveLoopRun(run);
      return run;
    }
  }

  const agent = (await repo.getAgent(def.agent_id)) ?? DEMO_AGENT;
  const situation: Situation = ctx.situation ?? "no_contact";
  let anyBlocked = false;

  // Produce each action's artifact (draft-first).
  for (const action of def.actions) {
    const artifact: Artifact = await draftArtifact({
      agent,
      lead: ctx.lead,
      situation,
      situationConfidence: ctx.situationConfidence ?? 0.85,
      actionType: action.type,
      evidence: ctx.evidence,
      loopRunId: runId,
      trigger: `loop:${def.name}`,
    });
    artifactIds.push(artifact.id);
    if (artifact.status === "blocked") anyBlocked = true;
    steps.push({
      at: nowISO(),
      stage: `action:${action.type}`,
      detail:
        artifact.status === "blocked"
          ? `Drafted but BLOCKED by compliance (${artifact.compliance_result.flags.length} flag(s)).`
          : `Drafted ${action.type} (${action.requiresApproval ? "needs approval" : "auto-create allowed"}).`,
      outcome: artifact.status === "blocked" ? "fail" : "pass",
    });
  }

  const run: LoopRun = {
    id: runId,
    loop_definition_id: def.id,
    agent_id: def.agent_id,
    lead_surface_id: ctx.lead.id,
    status: anyBlocked ? "blocked_compliance" : "produced_artifact",
    planner_trace: steps,
    artifact_ids: artifactIds,
    started_at: steps[0]!.at,
    completed_at: nowISO(),
  };
  await repo.saveLoopRun(run);

  return run;
}

/** Find loop definitions whose trigger matches an event type + payload. */
export function matchLoops(
  defs: LoopDefinition[],
  event: LoopDefinition["trigger"]["event"],
  payload: Record<string, unknown>
): LoopDefinition[] {
  return defs.filter((d) => {
    if (!d.active || d.trigger.event !== event) return false;
    if (!d.trigger.match) return true;
    return Object.entries(d.trigger.match).every(([k, v]) => payload[k] === v);
  });
}
