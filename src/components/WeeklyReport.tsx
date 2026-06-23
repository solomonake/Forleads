"use client";

import { useEffect, useState } from "react";
import type { WeeklyReport as Report } from "@/lib/core/types";
import { apiGet } from "./ui";

export function WeeklyReport() {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    apiGet<{ report: Report }>("/api/report").then((d) => setReport(d.report));
  }, []);

  if (!report) {
    return (
      <div className="panel">
        <h1>Weekly Intelligence Report</h1>
        <div className="sub">Generating…</div>
      </div>
    );
  }

  const m = report.metrics;
  const fmt = (d: string) => new Date(d).toLocaleDateString();

  return (
    <div className="panel">
      <h1>Weekly Intelligence Report</h1>
      <div className="sub">
        {fmt(report.periodStart)} – {fmt(report.periodEnd)} · makes the compounding intelligence
        visible.
      </div>

      <div className="metrics">
        <Metric n={m.prepared} label="Prepared" />
        <Metric n={m.approved} label="Approved" />
        <Metric n={m.sent} label="Sent / written" />
        <Metric n={m.replies} label="Replies" />
        <Metric n={m.bookings} label="Bookings" />
        <Metric n={m.blocked} label="Blocked (guardrail)" />
      </div>

      <h1 style={{ fontSize: 18 }}>What changed</h1>
      <div className="panel-grid" style={{ marginBottom: 22 }}>
        {report.whatChanged.map((c, i) => (
          <div className="row" key={i}>
            <div className="rmeta" style={{ marginTop: 0 }}>
              {c}
            </div>
          </div>
        ))}
      </div>

      <h1 style={{ fontSize: 18 }}>Recommended changes</h1>
      <div className="panel-grid">
        {report.recommendations.map((r, i) => (
          <div className="row" key={i}>
            <div className="rtitle">
              <span>{r.label}</span>
            </div>
            <div className="rmeta">action: {r.action}</div>
          </div>
        ))}
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
