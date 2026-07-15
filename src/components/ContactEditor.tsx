"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ContactPermission,
  ContactSource,
  LeadContact,
  LeadSurface,
} from "@/lib/core/types";
import { contactabilityPassport } from "@/lib/contacts/contactability";

interface Props {
  lead: LeadSurface;
  onSaved: (updated: LeadSurface) => void;
  onError: (message: string) => void;
}

function permission(contact: LeadContact | undefined, channel: "email" | "sms" | "call"): ContactPermission {
  if (channel === "email") {
    return contact?.optOutEmail ? "opted_out" : contact?.emailPermission ?? "unknown";
  }
  if (channel === "sms") {
    return contact?.optOutSms ? "opted_out" : contact?.smsPermission ?? "unknown";
  }
  return contact?.callPermission ?? "unknown";
}

function checkedLabel(value: string | undefined): string {
  if (!value) return "Verification date not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Verification date invalid" : `Checked ${date.toLocaleDateString()}`;
}

export function ContactEditor({ lead, onSaved, onError }: Props) {
  const initial = useMemo(() => ({
    name: lead.contact?.name ?? "",
    email: lead.contact?.email ?? "",
    phone: lead.contact?.phone ?? "",
    source: lead.contact?.source ?? "agent_entered" as ContactSource,
    sourceLabel: lead.contact?.sourceLabel ?? "",
    emailPermission: permission(lead.contact, "email"),
    smsPermission: permission(lead.contact, "sms"),
    callPermission: permission(lead.contact, "call"),
  }), [lead.contact]);
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [source, setSource] = useState<ContactSource>(initial.source);
  const [sourceLabel, setSourceLabel] = useState(initial.sourceLabel);
  const [emailPermission, setEmailPermission] = useState<ContactPermission>(initial.emailPermission);
  const [smsPermission, setSmsPermission] = useState<ContactPermission>(initial.smsPermission);
  const [callPermission, setCallPermission] = useState<ContactPermission>(initial.callPermission);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(initial.name);
    setEmail(initial.email);
    setPhone(initial.phone);
    setSource(initial.source);
    setSourceLabel(initial.sourceLabel);
    setEmailPermission(initial.emailPermission);
    setSmsPermission(initial.smsPermission);
    setCallPermission(initial.callPermission);
  }, [initial]);

  const dirty =
    name.trim() !== initial.name.trim()
    || email.trim() !== initial.email.trim()
    || phone.trim() !== initial.phone.trim()
    || source !== initial.source
    || sourceLabel.trim() !== initial.sourceLabel.trim()
    || emailPermission !== initial.emailPermission
    || smsPermission !== initial.smsPermission
    || callPermission !== initial.callPermission;

  const draftContact: LeadContact = {
    ...lead.contact,
    name: name.trim() || undefined,
    email: email.trim() || undefined,
    phone: phone.trim() || undefined,
    source,
    sourceLabel: sourceLabel.trim() || undefined,
    emailPermission,
    smsPermission,
    callPermission,
  };
  const passport = contactabilityPassport(draftContact);
  const needsPermissionBasis = !sourceLabel.trim()
    && [emailPermission, smsPermission, callPermission].includes("allowed");

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
          source,
          sourceLabel: sourceLabel.trim(),
          emailPermission,
          smsPermission,
          callPermission,
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

  const missingChannel = !email.trim() && !phone.trim();

  return (
    <div className={`contact-editor ${missingChannel ? "attention" : ""}`} data-testid="contact-editor">
      <div className="contact-editor-head">
        <span>Contactability passport</span>
        <span className="contact-editor-hint">
          {passport.summary === "missing"
            ? "No known relationship yet — parcel ownership is not a contact."
            : passport.summary === "verification_needed"
              ? "A channel exists, but permission still needs verification."
              : passport.summary === "blocked"
                ? "Every known channel is blocked. Keep the opt-out."
                : "At least one channel has a recorded relationship basis."}
        </span>
      </div>

      <div className="contact-passport-meta">
        <span>{passport.source}</span>
        <span>{checkedLabel(lead.contact?.verifiedAt)}</span>
        {lead.contact?.providerRefs?.followupboss ? <span>FUB person linked</span> : null}
      </div>
      <div className="contact-passport-channels">
        {passport.channels.map((entry) => (
          <span className={`contact-channel ${entry.state}`} key={entry.channel} title={entry.detail}>
            {entry.label}: {entry.state === "allowed" ? "allowed" : entry.state === "blocked" ? "blocked" : entry.state === "unknown" ? "verify" : "missing"}
          </span>
        ))}
      </div>

      <div className="contact-editor-row">
        <label>
          <span>Name</span>
          <input
            id="contact-name"
            type="text"
            placeholder="Known person (optional)"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
        </label>
      </div>
      <div className="contact-editor-row contact-source-row">
        <label>
          <span>Relationship source</span>
          <select
            value={source}
            disabled={initial.source === "crm"}
            onChange={(event) => setSource(event.target.value as ContactSource)}
          >
            <option value="agent_entered">Agent entered</option>
            <option value="first_party">First-party relationship</option>
            <option value="crm" disabled>Connected CRM</option>
            <option value="other">Other known source</option>
          </select>
        </label>
        <label>
          <span>Source detail {needsPermissionBasis ? "— required for allowed use" : ""}</span>
          <input
            type="text"
            placeholder="Open house, referral, CRM…"
            value={sourceLabel}
            disabled={initial.source === "crm"}
            onChange={(event) => setSourceLabel(event.target.value)}
            autoComplete="off"
          />
        </label>
      </div>
      <div className="contact-editor-row contact-channel-row">
        <label>
          <span>Email</span>
          <input
            type="email"
            placeholder="known@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
            inputMode="email"
          />
        </label>
        <label>
          <span>Email use</span>
          <select value={emailPermission} onChange={(event) => setEmailPermission(event.target.value as ContactPermission)}>
            <option value="unknown">Permission unknown</option>
            <option value="allowed">Relationship allows email</option>
            <option value="opted_out">Opted out</option>
          </select>
        </label>
      </div>
      <div className="contact-editor-row contact-channel-row">
        <label>
          <span>Phone</span>
          <input
            type="tel"
            placeholder="+1 405 555 0100"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="off"
            inputMode="tel"
          />
        </label>
        <label>
          <span>SMS use</span>
          <select value={smsPermission} onChange={(event) => setSmsPermission(event.target.value as ContactPermission)}>
            <option value="unknown">Permission unknown</option>
            <option value="allowed">Explicitly allowed</option>
            <option value="opted_out">Opted out</option>
          </select>
        </label>
        <label>
          <span>Call use</span>
          <select value={callPermission} onChange={(event) => setCallPermission(event.target.value as ContactPermission)}>
            <option value="unknown">DNC not checked</option>
            <option value="allowed">Allowed</option>
            <option value="opted_out">Do not call</option>
          </select>
        </label>
      </div>
      <div className="contact-editor-actions">
        <button className="minibtn primary" onClick={save} disabled={saving || !dirty || needsPermissionBasis}>
          {saving ? "Saving…" : "Save passport"}
        </button>
        <span>
          {needsPermissionBasis
            ? "Describe the relationship basis before marking a channel allowed."
            : "Saving records the current verification time. It never creates consent."}
        </span>
      </div>
    </div>
  );
}
