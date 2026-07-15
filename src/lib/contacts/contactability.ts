import type { LeadContact } from "@/lib/core/types";

export type ContactabilityState = "allowed" | "unknown" | "blocked" | "missing";

export interface ContactabilityChannel {
  channel: "email" | "sms" | "call";
  label: string;
  value?: string;
  state: ContactabilityState;
  detail: string;
}

export interface ContactabilityPassport {
  summary: "contactable" | "verification_needed" | "blocked" | "missing";
  source: string;
  verifiedAt?: string;
  channels: ContactabilityChannel[];
}

const SOURCE_LABELS: Record<NonNullable<LeadContact["source"]>, string> = {
  agent_entered: "Agent entered",
  first_party: "First-party relationship",
  crm: "Connected CRM",
  other: "Other known source",
};

function channel(
  name: ContactabilityChannel["channel"],
  value: string | undefined,
  permission: LeadContact["emailPermission"],
  legacyOptOut: boolean | undefined,
): ContactabilityChannel {
  const label = name === "email" ? "Email" : name === "sms" ? "SMS" : "Call";
  if (!value?.trim()) {
    return { channel: name, label, state: "missing", detail: "No channel saved" };
  }
  if (legacyOptOut || permission === "opted_out") {
    return { channel: name, label, value, state: "blocked", detail: "Do not contact" };
  }
  if (permission === "allowed") {
    return { channel: name, label, value, state: "allowed", detail: "Allowed by recorded relationship" };
  }
  return { channel: name, label, value, state: "unknown", detail: "Available; permission not verified" };
}

export function contactabilityPassport(contact: LeadContact | undefined): ContactabilityPassport {
  const channels = [
    channel("email", contact?.email, contact?.emailPermission, contact?.optOutEmail),
    channel("sms", contact?.phone, contact?.smsPermission, contact?.optOutSms),
    channel("call", contact?.phone, contact?.callPermission, undefined),
  ];
  const present = channels.filter((entry) => entry.state !== "missing");
  const summary = present.length === 0
    ? "missing"
    : present.some((entry) => entry.state === "allowed")
      ? "contactable"
      : present.some((entry) => entry.state === "unknown")
        ? "verification_needed"
        : "blocked";
  const source = contact?.sourceLabel?.trim()
    || (contact?.source ? SOURCE_LABELS[contact.source] : "Source not recorded");
  return { summary, source, verifiedAt: contact?.verifiedAt, channels };
}
