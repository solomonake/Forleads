import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { runScheduledLoops } = vi.hoisted(() => ({
  runScheduledLoops: vi.fn(async () => ({
    scannedAgents: 1,
    scannedDefinitions: 1,
    scannedLeads: 2,
    due: 1,
    claimed: 1,
    deduped: 0,
    produced: 1,
    skipped: 0,
    blocked: 0,
    errors: 0,
    capped: false,
  })),
}));

vi.mock("@/lib/db", () => ({
  getRepo: vi.fn(async () => ({})),
}));
vi.mock("@/lib/loops/scheduler", () => ({
  runScheduledLoops,
}));

import { GET } from "./route";

describe("GET /api/cron/loops", () => {
  const priorSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    runScheduledLoops.mockClear();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterEach(() => {
    if (priorSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = priorSecret;
  });

  it("fails closed when the secret is missing", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(new NextRequest("http://localhost/api/cron/loops"));
    expect(response.status).toBe(503);
    expect(runScheduledLoops).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer token", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/loops", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(response.status).toBe(401);
    expect(runScheduledLoops).not.toHaveBeenCalled();
  });

  it("runs the bounded scheduler for the valid Vercel token", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/loops", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      summary: { claimed: 1, produced: 1 },
    });
    expect(runScheduledLoops).toHaveBeenCalledWith({}, { maxRuns: 25 });
  });
});
