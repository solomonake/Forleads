"use client";

import { useState } from "react";
import { MapWorkspace } from "@/components/MapWorkspace";
import { ActionInbox } from "@/components/ActionInbox";
import { LoopStudio } from "@/components/LoopStudio";
import { ConnectorHub } from "@/components/ConnectorHub";
import { WeeklyReport } from "@/components/WeeklyReport";
import { Pipeline } from "@/components/Pipeline";
import { AgentTraceDrawer } from "@/components/AgentTraceDrawer";
import { AccountBar } from "@/components/AccountBar";

type View = "map" | "inbox" | "loops" | "connectors" | "report" | "pipeline";

const NAV: { key: View; icon: string; label: string }[] = [
  { key: "map", icon: "🗺", label: "Map (home)" },
  { key: "inbox", icon: "✉", label: "Action Inbox" },
  { key: "loops", icon: "🔁", label: "Loop Studio" },
  { key: "pipeline", icon: "▦", label: "Pipeline" },
  { key: "connectors", icon: "🔌", label: "Connector Hub" },
  { key: "report", icon: "📊", label: "Weekly Report" },
];

export function AppShell() {
  const [view, setView] = useState<View>("map");
  const [traceRef, setTraceRef] = useState<string | null>(null);

  return (
    <div id="app">
      <nav id="navrail">
        <div className="brand">
          For
          <br />
          <b>leads</b>
        </div>
        {NAV.map((n) => (
          <button
            key={n.key}
            className={`navbtn ${view === n.key ? "on" : ""}`}
            onClick={() => setView(n.key)}
            title={n.label}
          >
            {n.icon}
            <span className="nlabel">{n.label}</span>
          </button>
        ))}
      </nav>

      <div id="stage">
        <MapWorkspace onOpenTrace={setTraceRef} onNavigate={setView} />
        <AccountBar />
        {view === "inbox" && <ActionInbox onOpenTrace={setTraceRef} />}
        {view === "loops" && <LoopStudio />}
        {view === "pipeline" && <Pipeline onNavigate={setView} />}
        {view === "connectors" && <ConnectorHub />}
        {view === "report" && <WeeklyReport />}
      </div>

      <AgentTraceDrawer traceRef={traceRef} onClose={() => setTraceRef(null)} />
    </div>
  );
}
