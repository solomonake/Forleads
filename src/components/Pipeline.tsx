"use client";

import { useEffect, useMemo, useState } from "react";
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
];

const NEXT_MOVE: Record<
  LeadStatus,
  { detail: string; cta: string; view: "map" | "inbox" | "loops" | "connectors" | "pipeline"; value: string }
> = {
  new: {
    detail: "Ground the address and let the scout pass build the first operator brief.",
    cta: "Ground on map",
    view: "map",
    value: "Find out if this surface is worth time.",
  },
  researching: {
    detail: "Import an open feed, capture field evidence, or approve a grounded first touch.",
    cta: "Open source packs",
    view: "connectors",
    value: "Turn D-grade gaps into sourced next actions.",
  },
  contacted: {
    detail: "Review the drafted touch and move the lead into the next follow-up commitment.",
    cta: "Open inbox",
    view: "inbox",
    value: "Approve work that can become a real Gmail/CRM action.",
  },
  nurturing: {
    detail: "Run the nurture loop so the lead keeps moving without losing context.",
    cta: "Run loops",
    view: "loops",
    value: "Prevent quiet leads from dying in the spreadsheet.",
  },
  appointment: {
    detail: "Track appointment prep and make sure the next promise is already queued.",
    cta: "Open pipeline",
    view: "pipeline",
    value: "Keep the meeting and follow-up chain visible.",
  },
  won: {
    detail: "Capture the win, note the outcome, and feed the next referral motion.",
    cta: "Open pipeline",
    view: "pipeline",
    value: "Turn wins into reusable learning.",
  },
  dead: {
    detail: "Archive the trail cleanly and retain the learning signal for future loops.",
    cta: "Open pipeline",
    view: "pipeline",
    value: "Stop wasting cycles, keep the lesson.",
  },
};

export function Pipeline({
  onNavigate,
}: {
  onNavigate: (view: "map" | "inbox" | "loops" | "connectors" | "report" | "pipeline") => void;
}) {
  const [leads, setLeads] = useState<LeadSurface[]>([]);

  useEffect(() => {
    apiGet<{ leads: LeadSurface[] }>("/api/leads").then((d) => setLeads(d.leads));
  }, []);

  const stats = useMemo(
    () => ({
      total: leads.length,
      active: leads.filter((lead) => lead.status !== "won" && lead.status !== "dead").length,
      researching: leads.filter((lead) => lead.status === "researching").length,
      contacted: leads.filter((lead) => lead.status === "contacted").length,
    }),
    [leads]
  );

  return (
    <div className="panel">
      <h1>Pipeline</h1>
      <div className="sub">
        The money board: every property sits in the stage where it is blocked, waiting for approval,
        or ready for the next follow-up.
      </div>

      <div className="pipeline-hero">
        <div>
          <div className="pipeline-kicker">Lead command center</div>
          <div className="pipeline-title">Where is the deal stuck, and what moves it forward?</div>
          <div className="pipeline-copy">
            Map finds the surface. Open data and field signals prove whether it is worth chasing.
            Action Inbox holds the human-approved work. Loop Studio keeps stale leads from going cold.
          </div>
        </div>
        <div className="pipeline-actions">
          <button className="minibtn primary" onClick={() => onNavigate("map")}>
            Ground a new address
          </button>
          <button className="minibtn" onClick={() => onNavigate("inbox")}>
            Review drafted work
          </button>
          <button className="minibtn" onClick={() => onNavigate("loops")}>
            Run follow-up loops
          </button>
          <button className="minibtn" onClick={() => onNavigate("connectors")}>
            Open source packs
          </button>
          <button className="minibtn" onClick={() => onNavigate("report")}>
            See weekly report
          </button>
        </div>
      </div>

      <div className="pipeline-stats">
        <div className="pipeline-stat">
          <span className="pipeline-stat-label">Open leads</span>
          <strong>{stats.active}</strong>
        </div>
        <div className="pipeline-stat">
          <span className="pipeline-stat-label">Needs intelligence</span>
          <strong>{stats.researching}</strong>
        </div>
        <div className="pipeline-stat">
          <span className="pipeline-stat-label">Awaiting follow-up</span>
          <strong>{stats.contacted}</strong>
        </div>
        <div className="pipeline-stat">
          <span className="pipeline-stat-label">Total surfaces</span>
          <strong>{stats.total}</strong>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="empty-guide">
          <div className="empty-step">
            <div className="empty-step-num">1</div>
            <div>
              <div className="empty-step-title">Ground a real address</div>
              <div className="empty-step-copy">
                Start on the map with any typed address or city. The lead surface should appear
                immediately.
              </div>
            </div>
          </div>
          <div className="empty-step">
            <div className="empty-step-num">2</div>
            <div>
              <div className="empty-step-title">Add the field signal</div>
              <div className="empty-step-copy">
                Capture what happened at the door or on the phone so the system can choose the next
                best action.
              </div>
            </div>
          </div>
          <div className="empty-step">
            <div className="empty-step-num">3</div>
            <div>
              <div className="empty-step-title">Review the drafted work</div>
              <div className="empty-step-copy">
                Approve the compliant draft in the inbox, then come back here to track the next
                move.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="kanban">
          {COLUMNS.map((col) => {
            const colLeads = leads.filter((lead) => lead.status === col.status);
            return (
              <div className="kcol" key={col.status}>
                <div className="khead">
                  {col.label} ({colLeads.length})
                </div>
                {colLeads.map((lead) => {
                  const next = NEXT_MOVE[lead.status];
                  const openOnMap = () => {
                    window.dispatchEvent(
                      new CustomEvent("forleads:open-lead", {
                        detail: {
                          address: lead.address,
                          locality: lead.locality,
                          lng: lead.lng,
                          lat: lead.lat,
                        },
                      })
                    );
                    onNavigate("map");
                  };
                  return (
                    <div
                      className="kcard"
                      key={lead.id}
                      style={{ borderLeftColor: statusColor[lead.status] ?? "var(--st-new)" }}
                    >
                      <button className="ka ka-link" onClick={openOnMap} title="Open this lead on the map">
                        {lead.address}
                      </button>
                      <div className="km">{lead.locality ?? "Neighborhood pending"}</div>
                      <div className="kvalue">{next.value}</div>
                      <div className="kmeta">{next.detail}</div>
                      <div className="kactions">
                        <button className="minibtn" onClick={openOnMap}>
                          View on map
                        </button>
                        <button className="minibtn" onClick={() => onNavigate(next.view)}>
                          {next.cta}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
