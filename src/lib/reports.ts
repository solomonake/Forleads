// ============================================================================
// Weekly Intelligence Report (docs/_ProductionMarketPlan_ §8 S13). Makes the
// compounding value visible: actions prepared/approved/sent, replies, bookings,
// what changed, and recommended loop changes — derived from real domain events
// and artifacts (no naked numbers; everything counts something concrete).
// ============================================================================

import { nowISO, uuid } from "@/lib/core/ids";
import type { Artifact, DomainEvent, LoopRun, WeeklyReport } from "@/lib/core/types";
import { getRepo } from "@/lib/db";

export async function generateWeeklyReport(agentId: string): Promise<WeeklyReport> {
  const repo = await getRepo();
  const [artifacts, events, runs] = await Promise.all([
    repo.listArtifacts(agentId),
    repo.listEvents(agentId),
    repo.listLoopRuns(agentId),
  ]);

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 86400000);

  const metrics = computeMetrics(artifacts, events);
  const whatChanged = deriveInsights(artifacts, runs, events);
  const recommendations = deriveRecommendations(artifacts, runs);

  const report: WeeklyReport = {
    id: uuid(),
    agent_id: agentId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    metrics,
    whatChanged,
    recommendations,
    generated_at: nowISO(),
  };
  await repo.saveReport(report);
  return report;
}

function computeMetrics(artifacts: Artifact[], events: DomainEvent[]): WeeklyReport["metrics"] {
  const sent = artifacts.filter((a) => a.status === "sent").length;
  const approved = artifacts.filter((a) => a.status === "approved" || a.status === "sent").length;
  const blocked = artifacts.filter((a) => a.status === "blocked").length;
  const prepared = artifacts.length;
  const replies = events.filter((e) => e.type === "email.reply").length;
  const bookings = artifacts.filter((a) => a.type === "calendar" && (a.status === "sent" || a.status === "approved")).length;
  return { prepared, approved, sent, replies, bookings, blocked };
}

function deriveInsights(artifacts: Artifact[], runs: LoopRun[], events: DomainEvent[]): string[] {
  const out: string[] = [];
  const noContact = artifacts.filter((a) => a.trace_id && a.type === "email").length;
  if (noContact > 0) out.push(`${noContact} follow-up email draft(s) prepared from field notes.`);
  const blocked = artifacts.filter((a) => a.status === "blocked").length;
  if (blocked > 0) out.push(`${blocked} draft(s) blocked by the fair-housing linter before approval — the guardrail is working.`);
  const grounded = artifacts.filter((a) => a.evidence_used.some((e) => e.confidence === "A")).length;
  if (grounded > 0) out.push(`${grounded} draft(s) cited grade-A grounded evidence.`);
  const skipped = runs.filter((r) => r.status === "skipped_condition").length;
  if (skipped > 0) out.push(`${skipped} loop run(s) correctly skipped on conditions (e.g. opt-out / no channel).`);
  if (out.length === 0) out.push("No activity yet this period — tap a lead and add a note to start the loop.");
  return out;
}

function deriveRecommendations(artifacts: Artifact[], runs: LoopRun[]): { label: string; action: string }[] {
  const recs: { label: string; action: string }[] = [];
  const dGap = artifacts.some((a) => a.evidence_used.length === 0 || a.evidence_used.every((e) => e.confidence !== "A"));
  if (dGap) recs.push({ label: "Connect a market data source", action: "connect:market_provider" });
  if (runs.some((r) => r.status === "blocked_compliance")) {
    recs.push({ label: "Review blocked drafts in the Action Inbox", action: "open:action_inbox?filter=blocked" });
  }
  recs.push({ label: "Tighten stale-lead loop to 30 days", action: "edit:loop-stale-revival" });
  recs.push({ label: "Connect Follow Up Boss tasks", action: "connect:followupboss" });
  return recs;
}
