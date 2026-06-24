import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { withRoute } from "./index";

const req = () => new NextRequest("http://localhost/api/x", { method: "POST" });

describe("withRoute", () => {
  it("passes a normal response through and stamps x-request-id", async () => {
    const handler = withRoute("ok", async () => NextResponse.json({ a: 1 }));
    const res = await handler(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(await res.json()).toEqual({ a: 1 });
  });

  it("converts an uncaught throw into a 500 with a requestId (no opaque crash)", async () => {
    // Silence the expected error log for a clean test run.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withRoute("boom", async () => {
      throw new Error("kaboom");
    });
    const res = await handler(req());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; requestId: string };
    expect(body.error).toBe("internal error"); // internal message not leaked
    expect(body.requestId).toBeTruthy();
    expect(res.headers.get("x-request-id") ?? body.requestId).toBeTruthy();
    spy.mockRestore();
  });

  it("preserves a handler's own error status (e.g. 404)", async () => {
    const handler = withRoute("nf", async () =>
      NextResponse.json({ error: "nope" }, { status: 404 }),
    );
    expect((await handler(req())).status).toBe(404);
  });
});
