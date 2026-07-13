"use client";

import { useState } from "react";
import type {
  Artifact,
  ArtifactPayload,
  CalendarPayload,
  CrmNotePayload,
  EmailPayload,
  SmsPayload,
  TaskPayload,
} from "@/lib/core/types";
import { actionTypeLabel, humanizeToken } from "@/lib/design/labels";
import { apiPatch, apiPost, GradeChip } from "./ui";
import { MailIcon } from "./icons";

function friendlyWhen(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Agents review a task, hold, SMS, or CRM note the way they'd read it in
 * their own tools — never as raw JSON.
 */
function PayloadCard({ type, payload }: { type: Artifact["type"]; payload: ArtifactPayload }) {
  const rows: { k: string; v: string }[] = [];
  if (type === "task") {
    const p = payload as TaskPayload;
    rows.push({ k: "Task", v: p.title });
    rows.push({ k: "Due", v: friendlyWhen(p.dueAt) });
    if (p.notes) rows.push({ k: "Notes", v: p.notes });
  } else if (type === "calendar") {
    const p = payload as CalendarPayload;
    rows.push({ k: "Hold", v: p.title });
    rows.push({ k: "When", v: `${friendlyWhen(p.startAt)} – ${friendlyWhen(p.endAt)}` });
    if (p.notes) rows.push({ k: "Notes", v: p.notes });
  } else if (type === "sms") {
    const p = payload as SmsPayload;
    rows.push({ k: "To", v: p.to });
    rows.push({ k: "Message", v: p.body });
  } else if (type === "crm_note") {
    const p = payload as CrmNotePayload;
    if (p.contactRef) rows.push({ k: "Contact", v: p.contactRef });
    rows.push({ k: "Note", v: p.body });
    if (p.tags?.length) rows.push({ k: "Tags", v: p.tags.join(", ") });
  } else {
    for (const [k, v] of Object.entries(payload as unknown as Record<string, unknown>)) {
      if (v === undefined || v === null || v === "") continue;
      rows.push({ k: humanizeToken(k), v: typeof v === "string" ? v : JSON.stringify(v) });
    }
  }
  return (
    <>
      {rows.map((row) => (
        <div className="field" key={row.k}>
          <span className="k">{row.k}</span>
          <span className="v" style={{ whiteSpace: "pre-wrap" }}>
            {row.v}
          </span>
        </div>
      ))}
    </>
  );
}

export function ReviewTray({
  artifact,
  onClose,
  onApproved,
  onOpenTrace,
}: {
  artifact: Artifact;
  onClose: () => void;
  onApproved: (msg: string) => void;
  onOpenTrace: (ref: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(artifact);

  const isEmail = current.type === "email";
  const email = isEmail ? (current.payload as EmailPayload) : null;
  const [body, setBody] = useState(email?.body ?? "");
  const compliance = current.compliance_result;
  const blocked = !compliance.pass;

  const saveEdit = async () => {
    if (!email || body === email.body) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiPatch<{ artifact: Artifact }>(
        `/api/artifacts/${current.id}`,
        {
          expectedRevision: current.revision,
          payload: { ...email, body },
        },
      );
      setCurrent(result.artifact);
      setBody((result.artifact.payload as EmailPayload).body);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await apiPost<{
        connector: { provider: string; deduped: boolean; mode: string; url?: string };
      }>("/api/approve", {
        artifactId: current.id,
        expectedRevision: current.revision,
      });
      const c = d.connector;
      onApproved(
        isEmail
          ? `Draft created in ${humanizeToken(c.provider)} (${c.mode})${c.deduped ? " · already existed, not duplicated" : ""} — logged to memory`
          : `${actionTypeLabel(current.type)} written to ${humanizeToken(c.provider)} (${c.mode}) — logged to memory`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    const reason = window.prompt(
      "Why is this draft wrong? (optional — helps the composer next time)",
      "",
    );
    if (reason === null) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost<{ memoryId: string | null }>("/api/reject", {
        artifactId: current.id,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      onApproved(
        reason.trim()
          ? `Marked rejected · "${reason.trim().slice(0, 60)}" — logged to memory`
          : "Marked rejected — logged to memory",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="draft" onClick={(e) => e.stopPropagation()}>
        <div className="draft-head">
          <span style={{ color: "var(--brand)", display: "grid", placeItems: "center" }}>
            <MailIcon size={18} />
          </span>
          <div className="t">
            Draft <small>· ready for your review</small>
          </div>
          <div className={`compliance ${blocked ? "fail" : ""}`}>
            {blocked ? "✕ Blocked" : "✓ Fair-housing checked"}
          </div>
        </div>

        <div className="draft-body">
          {email ? (
            <>
              <div className="field">
                <span className="k">From</span>
                <span className="v">{email.from}</span>
              </div>
              <div className="field">
                <span className="k">To</span>
                <span className="v">{email.to}</span>
              </div>
              <div className="field">
                <span className="k">Subject</span>
                <span className="v">{email.subject}</span>
              </div>
              <div className="email-body">
                {editing ? (
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} />
                ) : (
                  body
                )}
              </div>
            </>
          ) : (
            <PayloadCard type={current.type} payload={current.payload} />
          )}

          {current.evidence_used.length > 0 && (
            <div className="evidence-used">
              <b style={{ color: "var(--text-2)" }}>Evidence used:</b>
              <br />
              {current.evidence_used.map((e, i) => (
                <span key={i} className="chip" style={{ display: "inline-flex" }}>
                  <GradeChip grade={e.confidence} /> {e.claim}
                </span>
              ))}
            </div>
          )}

          {compliance.flags.length > 0 && (
            <div className="flagbox">
              <b>{blocked ? "Blocked — must fix before approval:" : "Compliance notes:"}</b>
              {compliance.flags.map((f, i) => (
                <div className="flag" key={i}>
                  <span className="span">“{f.span}”</span> — {f.issue} <em>Fix: {f.fix}</em>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flagbox" style={{ marginTop: 12 }}>
              {error}
            </div>
          )}
        </div>

        <div className="draft-foot">
          <button className="btn" onClick={onClose}>
            Discard
          </button>
          <button
            className="btn"
            disabled={busy || current.status === "cancelled"}
            onClick={reject}
            title="Mark this draft wrong — the composer will learn from it"
          >
            Reject
          </button>
          {current.trace_id && (
            <button className="btn" onClick={() => onOpenTrace(current.trace_id!)}>
              Why?
            </button>
          )}
          {isEmail && (
            <button
              className="btn"
              disabled={busy}
              onClick={editing ? saveEdit : () => setEditing(true)}
            >
              {editing ? "Save & recheck" : "Edit"}
            </button>
          )}
          <button
            className="btn primary"
            disabled={blocked || busy || editing}
            onClick={approve}
          >
            {busy
              ? "Working…"
              : blocked
                ? "Blocked"
                : isEmail
                  ? "Approve & Create Draft"
                  : "Approve & Write"}
          </button>
        </div>
      </div>
    </div>
  );
}
