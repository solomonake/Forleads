"use client";

import { useEffect, useState } from "react";
import type { AgentTrace } from "@/lib/core/types";
import { humanizeToken } from "@/lib/design/labels";
import { apiGet, GradeChip } from "./ui";

/** One plain-English paragraph an agent can read in five seconds. */
function traceStory(trace: AgentTrace): string {
  const starts: Record<string, string> = {
    note_created: "You logged a field note on this lead",
    note: "You logged a field note on this lead",
    reply_logged: "You logged a reply from this contact",
    reply: "You logged a reply from this contact",
    schedule: "A follow-up schedule you set came due",
    scheduled: "A follow-up schedule you set came due",
    stage_change: "This lead changed stage",
  };
  const parts: string[] = [];
  parts.push(starts[trace.trigger] ?? `${humanizeToken(trace.trigger)} started this`);
  if (trace.situation) {
    const pct = trace.situationConfidence != null ? ` (${Math.round(trace.situationConfidence * 100)}% confident)` : "";
    parts.push(`it read like ${humanizeToken(trace.situation).toLowerCase()}${pct}`);
  }
  parts.push(
    trace.evidenceUsed.length > 0
      ? `so this was prepared from ${trace.evidenceUsed.length} piece${trace.evidenceUsed.length === 1 ? "" : "s"} of sourced evidence`
      : "so this was prepared — no property evidence was needed for it",
  );
  const sentence = `${parts.join(", ")}.`;
  const failed = trace.policy.some((p) => p.result !== "pass");
  const safety = failed
    ? " A safety check failed, so it cannot be approved until it's fixed."
    : " Every safety check passed.";
  const gate = trace.connector?.sent
    ? ` It was written to ${humanizeToken(trace.connector.provider)} after your approval.`
    : " Nothing leaves Forleads until you approve it.";
  return sentence + safety + gate;
}

export function AgentTraceDrawer({
  traceRef,
  onClose,
}: {
  traceRef: string | null;
  onClose: () => void;
}) {
  const [trace, setTrace] = useState<AgentTrace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!traceRef) return;
    setTrace(null);
    setError(null);
    apiGet<{ trace: AgentTrace }>(`/api/trace/${traceRef}`)
      .then((d) => setTrace(d.trace))
      .catch((e) => setError(String(e)));
  }, [traceRef]);

  if (!traceRef) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="trace" onClick={(e) => e.stopPropagation()}>
        <h3>🔍 Why this happened</h3>
        {error && <div className="tv fail">{error}</div>}
        {!trace && !error && <div className="tv">Loading trace…</div>}
        {trace && (
          <>
            <p className="tv" style={{ margin: "4px 0 14px", lineHeight: 1.55 }}>
              {traceStory(trace)}
            </p>
            <div className="tline">
              <span className="tk">What started this</span>
              <span className="tv">{humanizeToken(trace.trigger)}</span>
            </div>
            {trace.situation && (
              <div className="tline">
                <span className="tk">What it read like</span>
                <span className="tv">
                  {humanizeToken(trace.situation)}
                  {trace.situationConfidence != null && (
                    <> · {Math.round(trace.situationConfidence * 100)}% confident</>
                  )}
                </span>
              </div>
            )}
            <div className="tline">
              <span className="tk">Grounded on</span>
              <span className="tv">
                {trace.evidenceUsed.length === 0 && <em>none grounded</em>}
                {trace.evidenceUsed.map((e, i) => (
                  <span key={i} style={{ marginRight: 8, whiteSpace: "nowrap" }}>
                    <GradeChip grade={e.confidence} /> {e.claim}
                  </span>
                ))}
              </span>
            </div>
            {trace.excluded.length > 0 && (
              <div className="tline">
                <span className="tk">Excluded</span>
                <span className="tv">
                  {trace.excluded.map((x, i) => (
                    <div key={i} className="excluded">
                      “{x.content}” — {x.reason}
                    </div>
                  ))}
                </span>
              </div>
            )}
            {trace.priorOutcomes && (
              <div className="tline">
                <span className="tk">Prior outcomes</span>
                <span className="tv">
                  {trace.priorOutcomes.approved} approved · {trace.priorOutcomes.edited} edited · {trace.priorOutcomes.rejected} rejected
                  {trace.priorOutcomes.latestVerdict === "rejected" && trace.priorOutcomes.lastRejectedAt && (
                    <em style={{ display: "block", color: "var(--danger)", marginTop: 4 }}>
                      Latest outcome was a rejection on {new Date(trace.priorOutcomes.lastRejectedAt).toLocaleDateString()} — composer used a lower-pressure angle without claiming prior contact.
                    </em>
                  )}
                  {(trace.priorOutcomes.latestVerdict === "approved" || trace.priorOutcomes.latestVerdict === "edited") && (
                    <em style={{ display: "block", color: "var(--text-2)", marginTop: 4 }}>
                      Already corresponded with this lead — composer wrote a follow-up, not a first touch.
                    </em>
                  )}
                </span>
              </div>
            )}
            <div className="tline">
              <span className="tk">Safety checks</span>
              <span className="tv">
                {trace.policy.map((p, i) => (
                  <div key={i} className={p.result === "pass" ? "ok" : "fail"}>
                    {humanizeToken(p.name)}: {p.result}
                  </div>
                ))}
              </span>
            </div>
            <div className="tline">
              <span className="tk">Where it goes</span>
              <span className="tv">
                {trace.connector
                  ? `${humanizeToken(trace.connector.provider)} · ${humanizeToken(trace.connector.action)} · ${
                      trace.connector.sent ? "written after your approval" : "draft created, nothing sent"
                    } · protected against duplicates`
                  : "Nowhere yet — waiting for your approval"}
              </span>
            </div>
            <div className="tline" style={{ borderBottom: "none" }}>
              <span className="tk">What it cost</span>
              <span className="tv">
                {trace.cost.claudeCalls === 0 && trace.cost.paidDataCalls === 0
                  ? "Nothing — no AI calls, no paid data"
                  : `${trace.cost.claudeCalls} AI call${trace.cost.claudeCalls === 1 ? "" : "s"} · ${trace.cost.paidDataCalls} data lookup${trace.cost.paidDataCalls === 1 ? "" : "s"}`}
                {trace.cost.fallbackReason ? ` · fallback: ${trace.cost.fallbackReason}` : ""}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
