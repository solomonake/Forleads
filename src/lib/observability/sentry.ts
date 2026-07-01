import { config } from "@/lib/core/config";

export interface ReportErrorContext {
  name: string;
  method: string;
  status: number;
  requestId: string;
  ms: number;
}

interface SentryModule {
  init(options: Record<string, unknown>): void;
  captureException(error: Error, context?: Record<string, unknown>): void;
}

let initializedDsn: string | null = null;
let loadSentryModule = async (): Promise<SentryModule> => {
  const sentry = await import("@sentry/nextjs");
  return {
    init: sentry.init,
    captureException: sentry.captureException,
  };
};

function logWarn(msg: string, fields: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg, ...fields });
  // eslint-disable-next-line no-console
  console.warn(line);
}

export async function reportError(
  error: Error,
  context: ReportErrorContext,
): Promise<"disabled" | "reported" | "unavailable"> {
  const dsn = config.sentry.dsn;
  if (!dsn) return "disabled";

  try {
    const sentry = await loadSentryModule();
    if (initializedDsn !== dsn) {
      sentry.init({
        dsn,
        tracesSampleRate: 0,
        sendDefaultPii: false,
      });
      initializedDsn = dsn;
    }
    sentry.captureException(error, { extra: context });
    return "reported";
  } catch (cause) {
    logWarn("sentry.unavailable", {
      requestId: context.requestId,
      route: context.name,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return "unavailable";
  }
}

export function __setSentryLoaderForTests(loader: () => Promise<SentryModule>): void {
  loadSentryModule = loader;
}

export function __resetSentryForTests(): void {
  initializedDsn = null;
  loadSentryModule = async () => {
    const sentry = await import("@sentry/nextjs");
    return {
      init: sentry.init,
      captureException: sentry.captureException,
    };
  };
}
