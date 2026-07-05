// ContactEditor — inline lead-panel form for the owner's email/phone. When the
// lead has no email, an approved email draft can't be created (Gmail returns
// 400 on a non-RFC To). Rather than lecture the agent in an error toast, we
// expose the fix in the same panel: type an email, save, then re-approve.

"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeadSurface } from "@/lib/core/types";

interface Props {
  lead: LeadSurface;
  onSaved: (updated: LeadSurface) => void;
  onError: (message: string) => void;
}

export function ContactEditor({ lead, onSaved, onError }: Props) {
  const initial = useMemo(
    () => ({
      name: lead.contact?.name ?? "",
      email: lead.contact?.email ?? "",
      phone: lead.contact?.phone ?? "",
    }),
    [lead.contact?.name, lead.contact?.email, lead.contact?.phone],
  );
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [saving, setSaving] = useState(false);

  // If the parent switches leads, reset local state to the new lead's values.
  useEffect(() => {
    setName(initial.name);
    setEmail(initial.email);
    setPhone(initial.phone);
  }, [initial]);

  const dirty =
    name.trim() !== initial.name.trim() ||
    email.trim() !== initial.email.trim() ||
    phone.trim() !== initial.phone.trim();

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/lead/${encodeURIComponent(lead.id)}/contact`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        onError(body.error ?? `Save failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as { lead: LeadSurface };
      onSaved(data.lead);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Network error while saving contact");
    } finally {
      setSaving(false);
    }
  }

  const missingChannel = !initial.email.trim() && !initial.phone.trim();

  return (
    <div
      className={`contact-editor ${missingChannel ? "attention" : ""}`}
      data-testid="contact-editor"
    >
      <div className="contact-editor-head">
        <span>Owner contact</span>
        <span className="contact-editor-hint">
          {missingChannel
            ? "No contact yet — approved drafts can't send without an email or phone."
            : "Approval-gated drafts need a real email or phone."}
        </span>
      </div>
      <div className="contact-editor-row">
        <input
          id="contact-name"
          type="text"
          placeholder="Owner name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="contact-editor-row">
        <input
          type="email"
          placeholder="owner@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          inputMode="email"
        />
        <input
          type="tel"
          placeholder="+1 555 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="off"
          inputMode="tel"
        />
      </div>
      <div className="contact-editor-actions">
        <button
          className="minibtn primary"
          onClick={save}
          disabled={saving || !dirty}
        >
          {saving ? "Saving…" : "Save contact"}
        </button>
      </div>
    </div>
  );
}
