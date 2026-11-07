import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { registerErrorReporter, reportError, withRoute, type ErrorContext } from "./index";

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  vi.restoreAllMocks();
});

describe("reportError seam (G11)", () => {
  it("hands the error and context to every registered reporter", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: [string, ErrorContext][] = [];
    cleanups.push(registerErrorReporter((e, c) => seen.push([e.message, c])));
    reportError(new Error("boom"), { where: "test" });
    reportError("not an error", { where: "test2" });
    expect(seen).toEqual([
      ["boom", { where: "test" }],
      ["not an error", { where: "test2" }],
    ]);
  });

  it("logs one structured line even with no reporter registered", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError(new Error("quiet"), { where: "test" });
    const line = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(line).toMatchObject({ level: "error", msg: "error.reported", where: "test", error: "quiet" });
  });

  it("survives a reporter that throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    cleanups.push(registerErrorReporter(() => {
      throw new Error("tracker down");
    }));
    expect(() => reportError(new Error("x"), { where: "test" })).not.toThrow();
  });

  it("withRoute reports a 5xx with its requestId, but not a 4xx", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const seen: ErrorContext[] = [];
    cleanups.push(registerErrorReporter((_e, c) => seen.push(c)));
    const req = () => new NextRequest("http://localhost/api/x", { method: "GET" });

    const res = await withRoute("boom", async () => {
      throw new Error("kaboom");
    })(req());
    const body = (await res.json()) as { requestId: string };
    expect(seen).toEqual([expect.objectContaining({ where: "api.boom", requestId: body.requestId, status: 500 })]);

    await withRoute("bad", async () => {
      throw Object.assign(new Error("nope"), { status: 400 });
    })(req());
    expect(seen).toHaveLength(1);
  });
});
