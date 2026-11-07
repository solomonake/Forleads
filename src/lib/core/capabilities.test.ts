import { afterEach, describe, expect, it, vi } from "vitest";

// config.ts reads env at import time, so each case sets env, resets the
// module graph and imports fresh.
const KEYS = [
  "FORLEADS_AGENT_MODE",
  "ANTHROPIC_API_KEY",
  "FORLEADS_IMAGERY_PROVIDER",
  "MAPILLARY_TOKEN",
  "FORLEADS_GEOCODER",
  "FORLEADS_PERSIST",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "SESSION_SECRET",
] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.doUnmock("@/lib/agents/claude");
  vi.resetModules();
});

async function load(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  vi.resetModules();
  return import("./capabilities");
}

describe("capabilityReport (G10)", () => {
  it("reports agent live mode without a key as configured_no_key, not live", async () => {
    const caps = await load({ FORLEADS_AGENT_MODE: "live" });
    const report = await caps.capabilityReport();
    expect(report.agent).toMatchObject({ requested: "live", status: "configured_no_key", keyConfigured: false });
    expect(caps.effectiveMode(report.agent)).toBe("configured_no_key");
    expect(caps.degradedCapabilities(report)).toContain("agent");
  });

  it("reports live only when the key is present and the client constructs, without calling the model", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const caps = await load({ FORLEADS_AGENT_MODE: "live", ANTHROPIC_API_KEY: "sk-ant-test-not-real" });
    const report = await caps.capabilityReport();
    expect(report.agent).toMatchObject({ status: "live", keyConfigured: true });
    expect(caps.effectiveMode(report.agent)).toBe("live");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("reports client_error when the SDK client fails to construct", async () => {
    vi.doMock("@/lib/agents/claude", () => ({ claudeClientReady: () => false }));
    const caps = await load({ FORLEADS_AGENT_MODE: "live", ANTHROPIC_API_KEY: "sk-ant-test-not-real" });
    expect((await caps.capabilityReport()).agent.status).toBe("client_error");
  });

  it("never includes a credential value in the report", async () => {
    const secret = "sk-ant-test-SHOULD-NOT-LEAK";
    const caps = await load({
      FORLEADS_AGENT_MODE: "live",
      ANTHROPIC_API_KEY: secret,
      FORLEADS_IMAGERY_PROVIDER: "mapillary",
      MAPILLARY_TOKEN: "MLY|SHOULD-NOT-LEAK",
      GOOGLE_CLIENT_ID: "id-SHOULD-NOT-LEAK",
      GOOGLE_CLIENT_SECRET: "secret-SHOULD-NOT-LEAK",
      SESSION_SECRET: "session-SHOULD-NOT-LEAK",
    });
    const json = JSON.stringify(await caps.capabilityReport());
    expect(json).not.toContain("SHOULD-NOT-LEAK");
  });

  it("flags imagery named without its token", async () => {
    const caps = await load({ FORLEADS_IMAGERY_PROVIDER: "mapillary" });
    const report = await caps.capabilityReport();
    expect(report.imagery).toMatchObject({ requested: "mapillary", status: "configured_no_key" });
    expect(caps.effectiveMode(report.imagery)).toBe("configured_no_key");
  });

  it("caches the report for the TTL, then re-probes", async () => {
    const caps = await load({ FORLEADS_AGENT_MODE: "mock" });
    const first = await caps.capabilityReport(1_000);
    expect(await caps.capabilityReport(1_000 + caps.CAPABILITY_TTL_MS - 1)).toBe(first);
    expect(await caps.capabilityReport(1_000 + caps.CAPABILITY_TTL_MS)).not.toBe(first);
  });
});
