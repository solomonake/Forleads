// ============================================================================
// reportError — the one seam an error tracker plugs into (G11). No vendor is
// wired: choosing one (Sentry, Axiom, Logflare, …) is the owner's call. Until
// then every report is a structured log line, which Vercel already captures.
//
// To add a vendor later: call registerErrorReporter() once at startup (server:
// instrumentation.ts; browser: a client provider) with a function that
// forwards the error. Nothing else changes: withRoute (API 5xx) and the app
// error boundary (src/app/error.tsx) already call reportError().
//
// Isomorphic and dependency-free so client components can import it.
// ============================================================================

export interface ErrorContext {
  /** Where it happened: a route name, "app.error-boundary", … */
  where: string;
  requestId?: string;
  /** Small, non-sensitive fields only. Never credentials or personal data. */
  [key: string]: unknown;
}

export type ErrorReporter = (error: Error, context: ErrorContext) => void;

const reporters: ErrorReporter[] = [];

/** Register a tracker. Returns an unregister function. */
export function registerErrorReporter(reporter: ErrorReporter): () => void {
  reporters.push(reporter);
  return () => {
    const i = reporters.indexOf(reporter);
    if (i >= 0) reporters.splice(i, 1);
  };
}

/** Report an unexpected error. Never throws, even if a reporter does. */
export function reportError(error: unknown, context: ErrorContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  try {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        msg: "error.reported",
        ...context,
        error: err.message,
        stack: err.stack,
      }),
    );
  } catch {
    // Unserialisable context: the reporters below still run.
  }
  for (const reporter of reporters) {
    try {
      reporter(err, context);
    } catch {
      // A broken tracker must never take the app down with it.
    }
  }
}
