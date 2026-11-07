// POST /api/csp-report — receives Content-Security-Policy violation reports
// (security-headers.mjs, report-only for now) and logs one compact line per
// violation, so production can be checked before the policy is enforced:
// filter the Vercel logs for msg "csp.violation".
//
// Unauthenticated by nature (browsers send these without cookies), so the
// body is capped, the route is rate limited per IP, and only the directive
// and origin/path of the blocked resource are logged, never query strings.
//
// agent-doctor: public-endpoint (browsers send CSP reports without credentials;
// it writes no tenant data, only a rate-limited log line)
import { NextRequest, NextResponse } from "next/server";
import { log, withRoute } from "@/lib/observability";
import { enforceRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const MAX_BODY = 16_384;
const MAX_REPORTS = 20;

interface Violation {
  directive: string;
  blocked: string;
  document: string;
  disposition: string;
}

function trimUrl(value: unknown): string {
  if (typeof value !== "string" || value === "") return "";
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 200);
  } catch {
    // "inline", "eval", "data", "blob" and other keywords
    return value.slice(0, 40);
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 80) : "";
}

/** Accepts both report-uri (application/csp-report) and Reporting API bodies. */
export function parseViolations(body: unknown): Violation[] {
  const out: Violation[] = [];
  const legacy = (body as { "csp-report"?: Record<string, unknown> } | null)?.["csp-report"];
  if (legacy && typeof legacy === "object") {
    out.push({
      directive: str(legacy["effective-directive"] ?? legacy["violated-directive"]),
      blocked: trimUrl(legacy["blocked-uri"]),
      document: trimUrl(legacy["document-uri"]),
      disposition: str(legacy.disposition),
    });
    return out;
  }
  if (Array.isArray(body)) {
    for (const entry of body.slice(0, MAX_REPORTS)) {
      const report = entry as { type?: unknown; body?: Record<string, unknown> };
      if (report?.type !== "csp-violation" || !report.body) continue;
      out.push({
        directive: str(report.body.effectiveDirective),
        blocked: trimUrl(report.body.blockedURL),
        document: trimUrl(report.body.documentURL),
        disposition: str(report.body.disposition),
      });
    }
  }
  return out;
}

export const POST = withRoute("csp.report", async (req: NextRequest) => {
  const limited = enforceRateLimit(req, { name: "csp-report", perAgent: 0, perIp: 60 });
  if (limited) return limited;
  const text = await req.text();
  if (text.length > MAX_BODY) return new NextResponse(null, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  for (const violation of parseViolations(body)) log("warn", "csp.violation", { ...violation });
  return new NextResponse(null, { status: 204 });
});
