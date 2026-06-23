"use client";

import { useState } from "react";
import type { Artifact, EmailPayload } from "@/lib/core/types";
import { apiPost, GradeChip } from "./ui";

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

  const isEmail = artifact.type === "email";
  const email = isEmail ? (artifact.payload as EmailPayload) : null;
  const [body, setBody] = useState(email?.body ?? "");
  const compliance = artifact.compliance_result;
  const blocked = !compliance.pass;

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await apiPost<{ connector: { provider: string; deduped: boolean; mode: string; url?: string } }>(
        "/api/approve",
        { artifactId: artifact.id }
      );
      const c = d.connector;
      onApproved(
        isEmail
          ? `Draft created in ${c.provider} (${c.mode})${c.deduped ? " · deduped" : ""} — logged to memory`
          : `${artifact.type} written to ${c.provider} (${c.mode}) — logged to memory`
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
          <span style={{ color: "var(--brand)", fontSize: 18 }}>✉</span>
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
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--sans)", fontSize: 14 }}>
              {JSON.stringify(artifact.payload, null, 2)}
            </pre>
          )}

          {artifact.evidence_used.length > 0 && (
            <div className="evidence-used">
              <b style={{ color: "var(--text-2)" }}>Evidence used:</b>
              <br />
              {artifact.evidence_used.map((e, i) => (
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

          {error && <div className="flagbox" style={{ marginTop: 12 }}>{error}</div>}
        </div>

        <div className="draft-foot">
          <button className="btn" onClick={onClose}>
            Discard
          </button>
          {artifact.trace_id && (
            <button className="btn" onClick={() => onOpenTrace(artifact.trace_id!)}>
              Why?
            </button>
          )}
          {isEmail && (
            <button className="btn" onClick={() => setEditing((v) => !v)}>
              {editing ? "Done" : "Edit"}
            </button>
          )}
          <button className="btn primary" disabled={blocked || busy} onClick={approve}>
            {busy ? "Working…" : blocked ? "Blocked" : isEmail ? "Approve & Create Draft" : "Approve & Write"}
          </button>
        </div>
      </div>
    </div>
  );
}
