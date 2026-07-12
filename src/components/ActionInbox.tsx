"use client";

import { useCallback, useEffect, useState } from "react";
import type { Artifact, ArtifactStatus } from "@/lib/core/types";
import { actionTypeLabel } from "@/lib/design/labels";
import { ApiError, apiGet, apiPost, GradeChip } from "./ui";
import { CalendarIcon, CheckIcon, MailIcon, NoteIcon } from "./icons";

interface Item {
  artifact: Artifact;
  leadAddress: string;
}

const TABS: { key: string; label: string; match: (a: Artifact) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "drafts", label: "Drafts", match: (a) => a.type === "email" && a.status === "drafted" },
  { key: "tasks", label: "Tasks", match: (a) => a.type === "task" },
  { key: "holds", label: "Calendar Holds", match: (a) => a.type === "calendar" },
  { key: "review", label: "Needs Review", match: (a) => a.status === "drafted" },
  { key: "blocked", label: "Compliance Flags", match: (a) => a.status === "blocked" },
  { key: "sent", label: "Sent", match: (a) => a.status === "sent" || a.status === "approved" },
];

const statusPill: Record<ArtifactStatus, string> = {
  drafted: "pill-mock",
  blocked: "pill-blocked",
  approved: "pill-live",
  sent: "pill-live",
  cancelled: "",
  snoozed: "",
};

export function ActionInbox({
  onOpenTrace,
  onNavigate,
}: {
  onOpenTrace: (ref: string) => void;
  onNavigate: (view: "map" | "inbox" | "loops" | "connectors" | "report" | "pipeline") => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState("all");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await apiGet<{ items: Item[] }>("/api/inbox");
    setItems(d.items);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (artifact: Artifact) => {
    try {
      await apiPost("/api/approve", {
        artifactId: artifact.id,
        expectedRevision: artifact.revision,
      });
      setMsg("Approved — written to its connector (idempotent).");
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "connector_setup_required") {
        setMsg(`${e.message} Nothing was sent. Open Connector Hub to connect the missing live integration.`);
      } else if (e instanceof ApiError && e.status === 424) {
        setMsg(`${e.message} Nothing was sent. Open Connector Hub to add the missing live integration.`);
      } else {
        setMsg(e instanceof Error ? e.message : String(e));
      }
    }
    setTimeout(() => setMsg(null), 5000);
  };

  const dismiss = async (artifact: Artifact) => {
    try {
      await apiPost("/api/reject", {
        artifactId: artifact.id,
        reason: "Dismissed from the inbox",
      });
      setMsg("Dismissed — kept in the audit trail as cancelled.");
      await load();
    } catch (e) {
      setMsg(
        e instanceof ApiError && e.status === 401
          ? "Sign in to dismiss items."
          : e instanceof Error
            ? e.message
            : String(e)
      );
    }
    setTimeout(() => setMsg(null), 5000);
  };

  const logReply = async (artifact: Artifact) => {
    if (!artifact.lead_surface_id) return;
    try {
      const d = await apiPost<{ preparedCount: number }>(
        `/api/lead/${encodeURIComponent(artifact.lead_surface_id)}/reply`,
        {}
      );
      setMsg(
        d.preparedCount > 0
          ? `Reply logged — ${d.preparedCount} response draft${d.preparedCount === 1 ? "" : "s"} prepared below. Review, then hit send in Gmail.`
          : "Reply logged — follow-up loops will stop chasing this lead."
      );
      await load();
    } catch (e) {
      setMsg(
        e instanceof ApiError && e.status === 401
          ? "Sign in to log replies."
          : e instanceof Error
            ? e.message
            : String(e)
      );
    }
    setTimeout(() => setMsg(null), 5000);
  };

  const active = TABS.find((t) => t.key === tab)!;
  const filtered = items.filter((i) => active.match(i.artifact));

  return (
    <div className="panel">
      <h1>Action Inbox</h1>
      <div className="sub">
        Approval desk for real-world momentum: Gmail drafts, CRM tasks, calendar holds, SMS, and
        webhook jobs wait here until a human approves them.
      </div>
      <div className="tabs">
        {TABS.map((t) => {
          const n = items.filter((i) => t.match(i.artifact)).length;
          return (
            <button key={t.key} className={`tab ${tab === t.key ? "on" : ""}`} onClick={() => setTab(t.key)}>
              {t.label} {n > 0 ? `(${n})` : ""}
            </button>
          );
        })}
      </div>
      {msg && <div className="row notice-row" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="panel-grid">
        {filtered.length === 0 && (
          <div className="row">
            <div className="rmeta">
              {items.length === 0
                ? "No drafted work yet. Ground an address on the map, log a field note, and the agent drafts the next touch for your approval."
                : `Nothing under “${active.label}” right now — switch tabs to see the rest of the queue.`}
            </div>
            {items.length === 0 && (
              <div className="ractions">
                <button className="minibtn primary" onClick={() => onNavigate("map")}>
                  Open the map
                </button>
              </div>
            )}
          </div>
        )}
        {filtered.map(({ artifact, leadAddress }) => {
          const blocked = artifact.status === "blocked";
          return (
            <div className="row" key={artifact.id}>
              <div className="rtitle">
                <span className="rtitle-label">
                  <span className="rtitle-ico">
                    {artifact.type === "email" ? (
                      <MailIcon size={15} />
                    ) : artifact.type === "task" ? (
                      <CheckIcon size={15} />
                    ) : artifact.type === "calendar" ? (
                      <CalendarIcon size={15} />
                    ) : (
                      <NoteIcon size={15} />
                    )}
                  </span>
                  {labelFor(artifact)}
                </span>
                <span className={`pill-status ${statusPill[artifact.status]}`}>{artifact.status}</span>
              </div>
              <div className="rmeta">
                {leadAddress} · {actionTypeLabel(artifact.type)}
                {" · "}
                {artifact.evidence_used.length > 0 ? (
                  artifact.evidence_used.slice(0, 3).map((e, i) => (
                    <span key={i} style={{ marginLeft: 4 }}>
                      <GradeChip grade={e.confidence} />
                    </span>
                  ))
                ) : (
                  <em> no grounded evidence</em>
                )}
                {" · "}
                {blocked ? (
                  <span style={{ color: "var(--danger)" }}>
                    {artifact.compliance_result.flags[0]?.issue ?? "blocked"}
                  </span>
                ) : (
                  <span style={{ color: "var(--ok)" }}>Compliance ✓</span>
                )}
              </div>
              <div className="ractions">
                {artifact.trace_id && (
                  <button className="minibtn" onClick={() => onOpenTrace(artifact.trace_id!)}>
                    Why this exists
                  </button>
                )}
                {artifact.type === "email" &&
                  (artifact.status === "approved" || artifact.status === "sent") &&
                  artifact.lead_surface_id && (
                    <button
                      className="minibtn"
                      title="They answered your email — Forleads drafts the response for your approval"
                      onClick={() => logReply(artifact)}
                    >
                      They replied
                    </button>
                  )}
                {artifact.external_draft_ref?.url && (
                  <a className="minibtn" href={artifact.external_draft_ref.url} target="_blank" rel="noreferrer">
                    Open in {artifact.external_draft_ref.provider}
                  </a>
                )}
                {!blocked && artifact.status === "drafted" && (
                  <button className="minibtn primary" onClick={() => approve(artifact)}>
                    Approve
                  </button>
                )}
                {blocked && (
                  <button
                    className="minibtn danger"
                    title="See why compliance blocked this draft"
                    onClick={() => {
                      if (artifact.trace_id) {
                        onOpenTrace(artifact.trace_id);
                        return;
                      }
                      const flag = artifact.compliance_result.flags[0];
                      setMsg(
                        flag
                          ? `Blocked: ${flag.issue}. Fix: ${flag.fix}`
                          : "Blocked by compliance. Dismiss the draft or adjust the lead before retrying."
                      );
                      window.setTimeout(() => setMsg(null), 8000);
                    }}
                  >
                    Why blocked?
                  </button>
                )}
                {(artifact.status === "drafted" || artifact.status === "blocked") && (
                  <button
                    className="minibtn"
                    title="Dismiss — marks this item cancelled, nothing is sent"
                    aria-label="Dismiss this item"
                    onClick={() => dismiss(artifact)}
                  >
                    ✕ Dismiss
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function labelFor(a: Artifact): string {
  const p = a.payload as unknown as Record<string, unknown>;
  if ("subject" in p) return String(p.subject);
  if ("title" in p) return String(p.title);
  if ("body" in p) return String(p.body).slice(0, 60);
  return actionTypeLabel(a.type);
}
