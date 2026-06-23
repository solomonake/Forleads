"use client";

import { useEffect, useState } from "react";
import type { LeadStatus, LeadSurface } from "@/lib/core/types";
import { statusColor } from "@/lib/design/tokens";
import { apiGet } from "./ui";

const COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: "new", label: "New" },
  { status: "researching", label: "Research" },
  { status: "contacted", label: "Contacted" },
  { status: "nurturing", label: "Nurturing" },
  { status: "appointment", label: "Appointment" },
  { status: "won", label: "Won" },
  { status: "dead", label: "Dead" },
];

export function Pipeline() {
  const [leads, setLeads] = useState<LeadSurface[]>([]);

  useEffect(() => {
    apiGet<{ leads: LeadSurface[] }>("/api/leads").then((d) => setLeads(d.leads));
  }, []);

  return (
    <div className="panel">
      <h1>Pipeline</h1>
      <div className="sub">
        The CRM board — second to the map. Each lead carries its grade and next action. Overlay mode
        shows imported CRM records here too.
      </div>
      {leads.length === 0 ? (
        <div className="row">
          <div className="rmeta">
            No leads yet. Open the Map and search an address — every grounded address becomes a lead
            surface here.
          </div>
        </div>
      ) : (
        <div className="kanban">
          {COLUMNS.map((col) => {
            const colLeads = leads.filter((l) => l.status === col.status);
            return (
              <div className="kcol" key={col.status}>
                <div className="khead">
                  {col.label} ({colLeads.length})
                </div>
                {colLeads.map((l) => (
                  <div
                    className="kcard"
                    key={l.id}
                    style={{ borderLeftColor: statusColor[l.status] ?? "var(--st-new)" }}
                  >
                    <div className="ka">{l.address}</div>
                    <div className="km">{l.locality ?? l.h3_index}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
