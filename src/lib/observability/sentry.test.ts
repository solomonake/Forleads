import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctx = {
  name: "route.test",
  method: "POST",
  status: 500,
  requestId: "req-1",
  ms: 12,
};

describe("reportError", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete process.env.SENTRY_DSN;
  });

  afterEach(() => {
    delete process.env.SENTRY_DSN;
  });

  it("returns disabled when no DSN is configured", async () => {
    const sentry = await import("./sentry");
    await expect(sentry.reportError(new Error("boom"), ctx)).resolves.toBe("disabled");
  });

  it("swallows Sentry loader failures", async () => {
    process.env.SENTRY_DSN = "https://public@example.ingest.sentry.io/1";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sentry = await import("./sentry");
    sentry.__setSentryLoaderForTests(async () => {
      throw new Error("loader down");
    });

    await expect(sentry.reportError(new Error("boom"), ctx)).resolves.toBe("unavailable");
    expect(warn).toHaveBeenCalled();
  });
});
