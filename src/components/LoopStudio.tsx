"use client";

import { useCallback, useEffect, useState } from "react";
import type { LeadSurface, LoopAnalytics, LoopDefinition, LoopRun } from "@/lib/core/types";
import type { LoopObservability } from "@/lib/loops/observability";
import { apiGet, apiPost } from "./ui";

function plural(count: number, singular: string, pluralWord = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

function formatWhen(iso?: string) {
  if (!iso) return "never";
  return new Date(iso).toLocaleString();
}

function schedulePill(summary?: LoopObservability) {
  if (!summary) return { label: "unknown", className: "pill-mock" };
  if (summary.state === "due_now") return { label: "due now", className: "pill-blocked" };
  if (summary.state === "waiting") return { label: "scheduled", className: "pill-live" };
  if (summary.state === "paused") return { label: "paused", className: "pill-mock" };
  return { label: "event-driven", className: "pill-mock" };
}

function scheduleLine(summary?: LoopObservability) {
  if (!summary) return "Schedule health unavailable.";
  if (summary.state === "paused") return "Paused; no scheduled work will be claimed.";
  if (summary.state === "event_driven") return "Event-driven; waits for matching activity.";
  if (summary.state === "due_now") {
    return `${plural(summary.dueNow, "lead")} due now across ${plural(summary.trackedLeads, "tracked lead")}.`;
  }
  return `Next due ${formatWhen(summary.nextDueAt)} across ${plural(summary.trackedLeads, "tracked lead")}.`;
}

export function LoopStudio() {
  const [defs, setDefs] = useState<LoopDefinition[]>([]);
  const [runs, setRuns] = useState<LoopRun[]>([]);
  const [leads, setLeads] = useState<LeadSurface[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [analytics, setAnalytics] = useState<Record<string, LoopAnalytics>>({});
  const [observability, setObservability] = useState<Record<string, LoopObservability>>({});
  const [leadLabelMap, setLeadLabelMap] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, l] = await Promise.all([
      apiGet<{
        definitions: LoopDefinition[];
        runs: LoopRun[];
        analytics: Record<string, LoopAnalytics>;
        observability: Record<string, LoopObservability>;
        leadLabels: Record<string, string>;
      }>("/api/loops"),
      apiGet<{ leads: LeadSurface[] }>("/api/leads"),
    ]);
    setDefs(d.definitions);
    setRuns(d.runs);
    setAnalytics(d.analytics);
    setObservability(d.observability);
    setLeadLabelMap(d.leadLabels);
    setLeads(l.leads);
    setSelectedLeadId((current) => current || l.leads[0]?.id || "");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runNow = async (loopId: string) => {
    const lead = leads.find((candidate) => candidate.id === selectedLeadId);
    if (!lead) {
      setMsg("Open the Map and ground a lead first, then loops have something to act on.");
      setTimeout(() => setMsg(null), 3500);
      return;
    }
    try {
      const d = await apiPost<{ run: LoopRun }>("/api/loops", { loopId, leadId: lead.id });
      setMsg(`Ran "${loopId}" → status: ${d.run.status} (${d.run.artifact_ids.length} artifact(s)). See Action Inbox.`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
    setTimeout(() => setMsg(null), 4000);
  };

  return (
    <div className="panel">
      <h1>Loop Studio</h1>
      <div className="sub">
        Zapier-like power, shaped for real-estate work: WHEN something happens · IF the context
        matches · LET the agent prepare something · REQUIRE approval for risky actions · THEN write
        back · REPORT on a schedule. Every run is logged.
      </div>
      {msg && <div className="row" style={{ marginBottom: 14 }}>{msg}</div>}
      <label className="row" style={{ display: "block", marginBottom: 14 }}>
        <span className="rmeta">Lead used by “Run now”</span>
        <select
          value={selectedLeadId}
          onChange={(event) => setSelectedLeadId(event.target.value)}
          style={{ width: "100%", marginTop: 8 }}
        >
          <option value="">Select a grounded lead</option>
          {leads.map((lead) => (
            <option key={lead.id} value={lead.id}>
              {lead.address}
            </option>
          ))}
        </select>
      </label>

      <div className="panel-grid">
        {defs.map((d) => {
          const open = selected === d.id;
          const s = analytics[d.id] ?? {
            runs: 0,
            approved: 0,
            replies: 0,
            blocked: 0,
            produced: 0,
            skipped: 0,
          };
          const o = observability[d.id];
          const pill = schedulePill(o);
          return (
            <div className="row" key={d.id}>
              <div className="rtitle">
                <span>● {d.name}</span>
                <span className={`pill-status ${pill.className}`}>
                  {pill.label}
                </span>
              </div>
              <div className="rmeta">
                {d.description}
                <br />
                {scheduleLine(o)}
                {o?.lastRunAt ? ` Last run ${formatWhen(o.lastRunAt)}${o.lastRunStatus ? ` (${o.lastRunStatus})` : ""}.` : " No runs yet."}
                {o?.lastLeadId ? ` Last lead: ${leadLabelMap[o.lastLeadId] ?? "Unknown lead"}.` : ""}
                <br />
                {s.runs} runs · {s.produced} produced · {s.approved} approved · {s.replies} replies · {s.blocked} blocked
              </div>
              {open && (
                <div className="rmeta" style={{ marginTop: 10, borderTop: "1px dashed var(--hairline)", paddingTop: 10 }}>
                  <b style={{ color: "var(--text-2)" }}>WHEN</b> {d.trigger.event}
                  {d.trigger.match ? ` matches ${JSON.stringify(d.trigger.match)}` : ""}
                  <br />
                  <b style={{ color: "var(--text-2)" }}>IF</b>{" "}
                  {d.conditions.map((c) => c.kind + (c.value != null ? `=${JSON.stringify(c.value)}` : "")).join(" · ")}
                  <br />
                  <b style={{ color: "var(--text-2)" }}>DO</b>{" "}
                  {d.actions.map((a) => `${a.type}${a.requiresApproval ? " (needs approval)" : " (auto)"}`).join(" · ")}
                  <br />
                  <b style={{ color: "var(--text-2)" }}>REPORT</b> {d.cadence?.reportDay ?? "—"}
                  {d.cadence?.everyDays ? ` · every ${d.cadence.everyDays}d` : ""}
                </div>
              )}
              <div className="ractions">
                <button className="minibtn" onClick={() => setSelected(open ? null : d.id)}>
                  {open ? "Hide builder" : "View builder"}
                </button>
                <button className="minibtn primary" onClick={() => runNow(d.id)}>
                  Run now
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <h1 style={{ marginTop: 30, fontSize: 18 }}>Recent runs</h1>
      <div className="sub">
        Every manual and scheduled run is inspectable, with its planner trace.
      </div>
      <div className="panel-grid">
        {runs.length === 0 && (
          <div className="row">
            <div className="rmeta">No runs yet. Hit “Run now” on a loop above.</div>
          </div>
        )}
        {runs.slice(0, 12).map((r) => (
          <div className="row" key={r.id}>
            <div className="rtitle">
              <span>{r.loop_definition_id}</span>
              <span className={`pill-status ${r.status === "produced_artifact" ? "pill-live" : r.status === "blocked_compliance" ? "pill-blocked" : "pill-mock"}`}>
                {r.status}
              </span>
            </div>
            <div className="rmeta">
              {formatWhen(r.started_at)} · {leadLabelMap[r.lead_surface_id ?? ""] ?? "Unknown lead"} · {r.artifact_ids.length} artifact(s)
              {r.planner_trace.map((step, i) => (
                <div key={i} style={{ marginTop: 4 }}>
                  <span style={{ color: step.outcome === "fail" ? "var(--danger)" : step.outcome === "pass" ? "var(--ok)" : "var(--text-muted)" }}>
                    ▸ {step.stage}
                  </span>{" "}
                  — {step.detail}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
