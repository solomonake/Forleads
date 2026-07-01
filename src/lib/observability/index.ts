// ============================================================================
// Observability — structured request logging + a catch-all error boundary for
// API routes (audit axis 6). Deps-free floor: one JSON line per request to
// stdout (Vercel captures it; queryable in the dashboard / drains). Every
// response carries an `x-request-id` so a user-reported failure maps to a log.
//
// SEAM: `withRoute` is the one place errors surface, so wiring an external
// tracker (Sentry/Axiom/Logflare) later = add one call here, not touch 12 routes.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { uuid } from "@/lib/core/ids";
import { reportError } from "./sentry";

type Level = "info" | "warn" | "error";

/** Emit one structured JSON log line. */
export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  // eslint-disable-next-line no-console
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

type RouteHandler<C> = (req: NextRequest, ctx: C) => Promise<NextResponse> | NextResponse;

/**
 * Wrap an API route handler with a request log + error boundary. Logs the
 * method/path/status/latency with a generated requestId, stamps `x-request-id`
 * on the response, and converts any UNCAUGHT throw into a 500 `{error,requestId}`
 * (logged with the stack) so a thrown route can never leak an opaque crash.
 * Handlers keep returning their own 400/401/404/422/429 — those are logged, not
 * swallowed.
 */
export function withRoute<C = unknown>(
  name: string,
  handler: RouteHandler<C>,
): (req: NextRequest, ctx?: C) => Promise<NextResponse> {
  return async (req, ctx) => {
    const requestId = uuid();
    const started = Date.now();
    try {
      const res = await handler(req, ctx as C);
      res.headers.set("x-request-id", requestId);
      log(res.status >= 500 ? "error" : "info", "request", {
        name,
        method: req.method,
        status: res.status,
        ms: Date.now() - started,
        requestId,
      });
      return res;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      // A thrown error may declare its own client status (e.g. ValidationError →
      // 400). 4xx are client faults (logged warn, message surfaced); anything
      // else is a real server error (logged error+stack, message NOT leaked).
      const status = typeof (e as { status?: unknown }).status === "number"
        ? (e as { status: number }).status
        : 500;
      const client = status < 500;
      await reportError(err, {
        name,
        method: req.method,
        status,
        ms: Date.now() - started,
        requestId,
      });
      log(client ? "warn" : "error", client ? "request.rejected" : "request.error", {
        name,
        method: req.method,
        status,
        ms: Date.now() - started,
        requestId,
        error: err.message,
        ...(client ? {} : { stack: err.stack }),
      });
      const response = NextResponse.json(
        { error: client ? err.message : "internal error", requestId },
        { status },
      );
      response.headers.set("x-request-id", requestId);
      return response;
    }
  };
}
