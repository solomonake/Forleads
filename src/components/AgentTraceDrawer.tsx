"use client";

import { useEffect, useState } from "react";
import type { AgentTrace } from "@/lib/core/types";
import { apiGet, GradeChip } from "./ui";

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
            <div className="tline">
              <span className="tk">Trigger</span>
              <span className="tv">{trace.trigger}</span>
            </div>
            {trace.situation && (
              <div className="tline">
                <span className="tk">Situation</span>
                <span className="tv">
                  {trace.situation}
                  {trace.situationConfidence != null && (
                    <> · confidence {trace.situationConfidence.toFixed(2)}</>
                  )}
                </span>
              </div>
            )}
            <div className="tline">
              <span className="tk">Evidence used</span>
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
              <span className="tk">Policy</span>
              <span className="tv">
                {trace.policy.map((p, i) => (
                  <div key={i} className={p.result === "pass" ? "ok" : "fail"}>
                    {p.name}: {p.result}
                  </div>
                ))}
              </span>
            </div>
            <div className="tline">
              <span className="tk">Connector</span>
              <span className="tv">
                {trace.connector
                  ? `${trace.connector.provider} · ${trace.connector.action} · ${
                      trace.connector.sent ? "written" : "draft created, not sent"
                    } · key ${trace.connector.idempotencyKey}`
                  : "not yet dispatched (awaiting approval)"}
              </span>
            </div>
            <div className="tline" style={{ borderBottom: "none" }}>
              <span className="tk">Cost</span>
              <span className="tv">
                {trace.cost.claudeCalls} Claude call(s) · {trace.cost.paidDataCalls} paid data
                call(s)
                {trace.cost.inputTokens !== undefined
                  ? ` · ${trace.cost.inputTokens} input / ${trace.cost.outputTokens ?? 0} output tokens`
                  : ""}
                {trace.cost.cacheReadTokens
                  ? ` · ${trace.cost.cacheReadTokens} cache-read tokens`
                  : ""}
                {trace.cost.fallbackReason
                  ? ` · fallback: ${trace.cost.fallbackReason}`
                  : ""}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
