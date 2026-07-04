// ============================================================================
// Per-tenant credential schemas. The Connector Hub uses these to (a) render
// the paste-in fields for API-key providers and (b) validate a PUT payload
// before it reaches the sealed store.
//
// OAuth providers (Google, Microsoft) DO NOT appear here — their creds are
// written by the OAuth callback, not a paste-in form.
// ============================================================================

import type { ConnectorProvider } from "@/lib/core/types";

export type CredentialFieldKind = "text" | "password";

export interface CredentialField {
  /** The key in the encrypted payload. Case-sensitive. */
  key: string;
  /** Human label shown in the modal. */
  label: string;
  /** Short one-line hint under the field. */
  hint?: string;
  /** password → masked input; text → visible. Both are sealed at rest. */
  kind: CredentialFieldKind;
  /** Non-empty required. */
  required?: boolean;
  /** Optional length ceiling to catch obvious paste mistakes. */
  maxLength?: number;
}

export interface CredentialSchema {
  provider: ConnectorProvider;
  /** How the credential is presented in the Hub. */
  displayName: string;
  /** One-line description of what this credential unlocks. */
  summary: string;
  /** Where the user goes to obtain the credential; shown as a link line. */
  docsUrl?: string;
  /** Ordered list of paste-in fields. */
  fields: CredentialField[];
}

export const CREDENTIAL_SCHEMAS: Record<string, CredentialSchema> = {
  followupboss: {
    provider: "followupboss",
    displayName: "Follow Up Boss",
    summary: "Write notes, tasks, and appointments to your FUB workspace after approval.",
    docsUrl: "https://app.followupboss.com/2/admin/api",
    fields: [
      {
        key: "apiKey",
        label: "API key",
        hint: "Admin → API → New API key. Starts with fka_.",
        kind: "password",
        required: true,
        maxLength: 200,
      },
    ],
  },
  gohighlevel: {
    provider: "gohighlevel",
    displayName: "GoHighLevel",
    summary: "Write CRM notes, tasks, and contact syncs to your GHL location after approval.",
    docsUrl: "https://help.gohighlevel.com/support/solutions/articles/48001222153",
    fields: [
      {
        key: "apiKey",
        label: "API key",
        hint: "Location → Settings → API. Location-scoped.",
        kind: "password",
        required: true,
        maxLength: 400,
      },
      {
        key: "locationId",
        label: "Location ID",
        hint: "Location → Settings → Business Profile.",
        kind: "text",
        required: true,
        maxLength: 100,
      },
    ],
  },
  twilio: {
    provider: "twilio",
    displayName: "Twilio · SMS",
    summary: "Send approved SMS to contacts who have opted in.",
    docsUrl: "https://www.twilio.com/console",
    fields: [
      {
        key: "accountSid",
        label: "Account SID",
        hint: "Console → Account Info. Starts with AC.",
        kind: "text",
        required: true,
        maxLength: 100,
      },
      {
        key: "authToken",
        label: "Auth Token",
        hint: "Console → Account Info.",
        kind: "password",
        required: true,
        maxLength: 200,
      },
      {
        key: "fromNumber",
        label: "From number",
        hint: "A Twilio number in your account, E.164 format.",
        kind: "text",
        required: true,
        maxLength: 30,
      },
    ],
  },
};

export function credentialSchemaFor(
  provider: ConnectorProvider,
): CredentialSchema | null {
  return CREDENTIAL_SCHEMAS[provider] ?? null;
}

/** Parse a PUT payload into the sealed shape. Throws a ValidationError-shaped
 *  Error (with .status = 400) on any missing/invalid field. */
export function parseCredentialPayload(
  provider: ConnectorProvider,
  body: unknown,
): Record<string, string> {
  const schema = credentialSchemaFor(provider);
  if (!schema) {
    const err = new Error(`Provider "${provider}" has no paste-in credential schema.`);
    (err as { status?: number }).status = 400;
    throw err;
  }
  if (!body || typeof body !== "object") {
    const err = new Error("Body must be an object of credential fields.");
    (err as { status?: number }).status = 400;
    throw err;
  }
  const payload: Record<string, string> = {};
  const source = body as Record<string, unknown>;
  for (const field of schema.fields) {
    const raw = source[field.key];
    if (raw === undefined || raw === null || raw === "") {
      if (field.required) {
        const err = new Error(`${field.label} is required.`);
        (err as { status?: number }).status = 400;
        throw err;
      }
      continue;
    }
    if (typeof raw !== "string") {
      const err = new Error(`${field.label} must be a string.`);
      (err as { status?: number }).status = 400;
      throw err;
    }
    const trimmed = raw.trim();
    if (field.maxLength && trimmed.length > field.maxLength) {
      const err = new Error(`${field.label} is longer than ${field.maxLength} characters.`);
      (err as { status?: number }).status = 400;
      throw err;
    }
    payload[field.key] = trimmed;
  }
  return payload;
}
