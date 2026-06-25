"use client";

import { useCallback, useEffect, useState } from "react";
import type { Artifact, ArtifactStatus } from "@/lib/core/types";
import { apiGet, apiPost, GradeChip } from "./ui";

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

export function ActionInbox({ onOpenTrace }: { onOpenTrace: (ref: string) => void }) {
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
      setMsg(e instanceof Error ? e.message : String(e));
    }
    setTimeout(() => setMsg(null), 3000);
  };

  const active = TABS.find((t) => t.key === tab)!;
  const filtered = items.filter((i) => active.match(i.artifact));

  return (
    <div className="panel">
      <h1>Action Inbox</h1>
      <div className="sub">
        One place for all the work the agents prepared. Nothing sends without your approval.
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
      {msg && <div className="row" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="panel-grid">
        {filtered.length === 0 && (
          <div className="row">
            <div className="rmeta">
              No items here yet. Open the Map, tap a lead, add a note, and draft an action — it
              lands here.
            </div>
          </div>
        )}
        {filtered.map(({ artifact, leadAddress }) => {
          const blocked = artifact.status === "blocked";
          return (
            <div className="row" key={artifact.id}>
              <div className="rtitle">
                <span>
                  {artifact.type === "email" ? "✉" : artifact.type === "task" ? "✓" : artifact.type === "calendar" ? "📅" : "📝"}{" "}
                  {labelFor(artifact)}
                </span>
                <span className={`pill-status ${statusPill[artifact.status]}`}>{artifact.status}</span>
              </div>
              <div className="rmeta">
                {leadAddress} · {artifact.type}
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
                {blocked && <button className="minibtn danger">Fix required</button>}
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
  return a.type;
}
