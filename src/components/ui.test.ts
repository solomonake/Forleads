// ============================================================================
// ui.test.ts — apiPost/apiGet must throw a typed ApiError that carries the
// server's requestId, so the failure toast can render an "incident 4f0334ea…"
// chip + a Retry CTA per [[accountability-show-failures]].
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPost, ApiError } from "./api";

const realFetch = globalThis.fetch;

function mockFetch(impl: typeof fetch) {
  globalThis.fetch = impl as never;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("apiPost", () => {
  it("returns parsed JSON on 2xx", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req-ok" },
      }),
    );
    const r = await apiPost<{ ok: boolean }>("/api/x", { y: 1 });
    expect(r.ok).toBe(true);
  });

  it("throws ApiError with requestId from JSON body on 5xx", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ error: "internal error", requestId: "rid-body" }), {
        status: 500,
        headers: { "content-type": "application/json", "x-request-id": "rid-header" },
      }),
    );
    try {
      await apiPost("/api/lead", { address: "1 Test St" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.status).toBe(500);
      expect(err.message).toBe("internal error");
      // Body wins over header — the route explicitly chose this id.
      expect(err.requestId).toBe("rid-body");
    }
  });

  it("falls back to x-request-id header when body lacks requestId", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ error: "bad input" }), {
        status: 400,
        headers: { "content-type": "application/json", "x-request-id": "rid-header" },
      }),
    );
    try {
      await apiPost("/api/lead", {});
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).requestId).toBe("rid-header");
      expect((e as ApiError).status).toBe(400);
    }
  });

  it("tolerates non-JSON bodies on failure (e.g. HTML from a CDN)", async () => {
    mockFetch(async () =>
      new Response("<html>503 backend</html>", {
        status: 503,
        headers: { "content-type": "text/html", "x-request-id": "rid-h" },
      }),
    );
    try {
      await apiPost("/api/lead", {});
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.status).toBe(503);
      // Falls back to label-based message + header id.
      expect(err.message).toMatch(/POST \/api\/lead → 503/);
      expect(err.requestId).toBe("rid-h");
    }
  });
});

describe("apiGet", () => {
  it("uses the same ApiError envelope on failure", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ error: "not found", requestId: "g-rid" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );
    try {
      await apiGet("/api/whatever");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(404);
      expect((e as ApiError).requestId).toBe("g-rid");
    }
  });
});
