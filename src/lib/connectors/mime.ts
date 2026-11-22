// ============================================================================
// RFC 2822 MIME + base64url encoding for Gmail drafts. Gmail's drafts.create
// requires a raw, base64url-encoded MIME message
// (docs/Forleads_ProductionMarketPlan_v1.md §6, Gmail Drafts API).
// Pure + dependency-free so it's unit-testable without network.
// ============================================================================

export interface MimeInput {
  from: string;
  to: string;
  subject: string;
  body: string;
}

/** Base64url (RFC 4648 §5) — '+'→'-', '/'→'_', no padding. */
export function base64Url(input: string): string {
  const b64 = Buffer.from(input, "utf-8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Encode non-ASCII headers per RFC 2047. */
function encodeHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

/** Header values must be a single line: a CR or LF in a composed subject or
 *  address would let text smuggle extra headers (for example a Bcc). */
function oneLine(value: string): string {
  return String(value ?? "").replace(/[\r\n]+/g, " ");
}

export function buildMimeMessage(input: MimeInput): string {
  const headers = [
    `From: ${oneLine(input.from)}`,
    `To: ${oneLine(input.to)}`,
    `Subject: ${encodeHeader(oneLine(input.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ];
  return headers.join("\r\n") + "\r\n\r\n" + input.body;
}

/** The exact `raw` value Gmail's users.drafts.create expects. */
export function buildGmailRaw(input: MimeInput): string {
  return base64Url(buildMimeMessage(input));
}
