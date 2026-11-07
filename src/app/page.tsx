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
import { GettingStarted } from "@/components/GettingStarted";
import {
  ChartIcon,
  ColumnsIcon,
  InboxIcon,
  LoopIcon,
  MapIcon,
  PlugIcon,
} from "@/components/icons";

type View = "map" | "inbox" | "loops" | "connectors" | "report" | "pipeline";

// `label` renders under the icon and is the button's accessible name; the
// tooltip repeats it so sighted and screen-reader users hear the same name.
// Labels walk the agent's day in order: scout a property, approve the
// prepared work, let follow-up run, track deals, wire tools, see the recap.
const NAV: { key: View; icon: React.ReactNode; label: string }[] = [
  { key: "map", icon: <MapIcon />, label: "Prospect" },
  { key: "inbox", icon: <InboxIcon />, label: "Approvals" },
  { key: "loops", icon: <LoopIcon />, label: "Autopilot" },
  { key: "pipeline", icon: <ColumnsIcon />, label: "Deals" },
  { key: "connectors", icon: <PlugIcon />, label: "Connect" },
  { key: "report", icon: <ChartIcon />, label: "Recap" },
];

export default function Page() {
  const [view, setView] = useState<View>("map");
  const [traceRef, setTraceRef] = useState<string | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  // Assume the setup checklist will show until it reports otherwise, so the
  // launchpad never flashes in and straight back out on first paint.
  const [checklistOnMap, setChecklistOnMap] = useState(true);

  return (
    <div id="app">
      <nav id="navrail" aria-label="Main">
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
            aria-current={view === n.key ? "page" : undefined}
          >
            {n.icon}
            <span className="nlabel">{n.label}</span>
          </button>
        ))}
      </nav>

      <main id="stage">
        {/* The map has no visible title, so the home view gets a visually hidden h1.
            Every other view renders its own h1 in its panel. */}
        {view === "map" && <h1 className="sr-only">Forleads: prospect any address on the map</h1>}
        {/* The map mounts once and stays alive; panels overlay it. The map is the home screen. */}
        <MapWorkspace
          onOpenTrace={setTraceRef}
          onNavigate={setView}
          showLaunchpad={!checklistOnMap}
          onLeadOpenChange={setLeadOpen}
        />
        <AccountBar />
        {view === "inbox" && <ActionInbox onOpenTrace={setTraceRef} onNavigate={setView} />}
        {view === "loops" && <LoopStudio onNavigate={setView} />}
        {view === "pipeline" && <Pipeline onNavigate={setView} />}
        {view === "connectors" && <ConnectorHub />}
        {view === "report" && <WeeklyReport onNavigate={setView} />}
        <GettingStarted
          view={view}
          onNavigate={setView}
          forceCompact={view === "map" && leadOpen}
          onCardVisibleChange={setChecklistOnMap}
        />
      </main>

      <AgentTraceDrawer traceRef={traceRef} onClose={() => setTraceRef(null)} />
    </div>
  );
}
