"use client";

import { useEffect, useState } from "react";
import type { WeeklyReport as Report } from "@/lib/core/types";
import { apiGet } from "./ui";

type View = "map" | "inbox" | "loops" | "connectors" | "report" | "pipeline";

// Recommendations carry a machine ref ("connect:followupboss",
// "open:action_inbox?filter=blocked", "edit:loop-stale-revival"). Route each
// to the surface where the operator can actually act on it.
function recommendationCta(action: string): { label: string; view: View } {
  if (action.startsWith("connect:")) return { label: "Open Connector Hub", view: "connectors" };
  if (action.startsWith("open:action_inbox")) return { label: "Open Action Inbox", view: "inbox" };
  if (action.startsWith("edit:loop")) return { label: "Open Loop Studio", view: "loops" };
  return { label: "Open the map", view: "map" };
}

export function WeeklyReport({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ report: Report }>("/api/report")
      .then((d) => setReport(d.report))
      .catch((e) => {
        setError(
          e instanceof Error && /authentication/i.test(e.message)
            ? "Sign in to see your weekly report."
            : "Couldn't load this week's report — reload to try again."
        );
      });
  }, []);

  if (error) {
    return (
      <div className="panel">
        <h1>Weekly Recap</h1>
        <div className="sub">{error}</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="panel">
        <h1>Weekly Recap</h1>
        <div className="sub">Assembling this week&apos;s numbers…</div>
      </div>
    );
  }

  const m = report.metrics;
  const fmt = (d: string) => new Date(d).toLocaleDateString();
  const quietWeek =
    m.prepared + m.approved + m.sent + m.replies + m.bookings + m.blocked === 0;

  return (
    <div className="panel">
      <h1>Weekly Recap</h1>
      <div className="sub">
        {fmt(report.periodStart)} – {fmt(report.periodEnd)} · what the system found, prepared, and
        sent for you this week — including where it failed or stayed blocked. Every number is from
        work you approved, never a projection.
      </div>

      <div className="metrics">
        <Metric n={m.prepared} label="Prepared" />
        <Metric n={m.approved} label="Approved" />
        <Metric n={m.sent} label="Sent / written" />
        <Metric n={m.replies} label="Replies" />
        <Metric n={m.bookings} label="Bookings" />
        <Metric n={m.blocked} label="Blocked (guardrail)" />
      </div>

      {quietWeek && (
        <div className="empty-guide" style={{ marginBottom: 22 }}>
          <div className="empty-step">
            <div className="empty-step-num">1</div>
            <div>
              <div className="empty-step-title">This report writes itself as you work</div>
              <div className="empty-step-copy">
                Ground an address, capture a field note, and approve the drafted follow-up — each
                action becomes a number here at the end of the week.
              </div>
            </div>
          </div>
          <div className="empty-step">
            <div className="empty-step-num">2</div>
            <div>
              <div className="empty-step-title">Start where the money is</div>
              <div className="empty-step-copy">
                The fastest way to a non-zero week: one real address, one honest note, one approved
                draft.
              </div>
            </div>
          </div>
          <div className="pipeline-actions" style={{ marginTop: 4 }}>
            <button className="minibtn primary" onClick={() => onNavigate("map")}>
              Ground an address
            </button>
            <button className="minibtn" onClick={() => onNavigate("inbox")}>
              Review drafted work
            </button>
            <button className="minibtn" onClick={() => onNavigate("loops")}>
              Run a follow-up loop
            </button>
          </div>
        </div>
      )}

      <h1 style={{ fontSize: 18 }}>What changed</h1>
      <div className="panel-grid" style={{ marginBottom: 22 }}>
        {report.whatChanged.length === 0 && (
          <div className="row">
            <div className="rmeta" style={{ marginTop: 0 }}>
              Nothing recorded this period yet — changes appear here as leads move stages.
            </div>
          </div>
        )}
        {report.whatChanged.map((c, i) => (
          <div className="row" key={i}>
            <div className="rmeta" style={{ marginTop: 0 }}>
              {c}
            </div>
          </div>
        ))}
      </div>

      <h1 style={{ fontSize: 18 }}>Recommended next moves</h1>
      <div className="panel-grid">
        {report.recommendations.length === 0 && (
          <div className="row">
            <div className="rmeta" style={{ marginTop: 0 }}>
              Recommendations appear once there&apos;s a week of activity to learn from.
            </div>
          </div>
        )}
        {report.recommendations.map((r, i) => {
          const cta = recommendationCta(r.action);
          return (
            <div className="row" key={i}>
              <div className="rtitle">
                <span>{r.label}</span>
              </div>
              <div className="ractions">
                <button className="minibtn" onClick={() => onNavigate(cta.view)}>
                  {cta.label}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ n, label }: { n: number; label: string }) {
  return (
    <div className="metric">
      <div className="statbig">{n}</div>
      <div className="statlabel">{label}</div>
    </div>
  );
}
