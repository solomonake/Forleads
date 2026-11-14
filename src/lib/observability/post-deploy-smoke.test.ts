import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { basemapStyleUrl, runSmoke } from "../../../scripts/post-deploy-smoke.mjs";
import { BASEMAP_STYLE_URL } from "@/lib/map/basemap";

const BASE = "https://deploy.example";
const STYLE = "https://tiles.example/styles/dark";
const TILEJSON = "https://tiles.example/planet";

const goodHeaders = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": "frame-ancestors 'none'",
  "strict-transport-security": "max-age=63072000",
};

type Routes = Record<string, () => Response>;

function fakeFetch(overrides: Routes = {}) {
  const routes: Routes = {
    [`${BASE}/`]: () => new Response("<html></html>", { status: 200, headers: goodHeaders }),
    [`${BASE}/api/health`]: () => Response.json({ ok: true, degraded: [] }),
    [STYLE]: () => Response.json({ sources: { openmaptiles: { type: "vector", url: TILEJSON } } }),
    [TILEJSON]: () => Response.json({ tiles: ["https://tiles.example/planet/{z}/{x}/{y}.pbf"] }),
    ...overrides,
  };
  const calls: { url: string; method: string }[] = [];
  const impl = async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET" });
    const route = routes[url];
    return route ? route() : new Response("not found", { status: 404 });
  };
  return { impl, calls };
}

async function run(overrides?: Routes) {
  const f = fakeFetch(overrides);
  const results = (await runSmoke(BASE, { fetchImpl: f.impl, styleUrl: STYLE })) as {
    name: string;
    ok: boolean;
    detail: string;
  }[];
  return { results, calls: f.calls, failed: results.filter((r) => !r.ok) };
}

describe("post-deploy smoke (G11)", () => {
  it("passes a healthy deployment using GET requests only", async () => {
    const { failed, calls, results } = await run();
    expect(failed).toEqual([]);
    expect(results).toHaveLength(3);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("fails when a security header is missing", async () => {
    const { failed } = await run({
      [`${BASE}/`]: () => new Response("", { status: 200, headers: { ...goodHeaders, "x-frame-options": "" } }),
    });
    expect(failed.map((f) => f.detail).join()).toContain("x-frame-options");
  });

  it("fails when health is not 200 or not ok", async () => {
    expect((await run({ [`${BASE}/api/health`]: () => Response.json({ ok: false }, { status: 503 }) })).failed[0]?.name).toBe("health ok");
    expect((await run({ [`${BASE}/api/health`]: () => Response.json({ ok: false }) })).failed[0]?.detail).toContain("ok is false");
  });

  it("reports degraded capabilities without failing", async () => {
    const { failed, results } = await run({
      [`${BASE}/api/health`]: () => Response.json({ ok: true, degraded: ["agent"] }),
    });
    expect(failed).toEqual([]);
    expect(results.find((r) => r.name === "health ok")?.detail).toContain("degraded: agent");
  });

  it("fails when the basemap style or TileJSON is unavailable, or points at CARTO", async () => {
    expect((await run({ [STYLE]: () => new Response("", { status: 503 }) })).failed[0]?.name).toBe("basemap style and tiles");
    expect((await run({ [TILEJSON]: () => new Response("", { status: 404 }) })).failed).toHaveLength(1);
    expect(
      (await run({ [TILEJSON]: () => Response.json({ tiles: ["https://a.basemaps.cartocdn.com/{z}/{x}/{y}.png"] }) })).failed[0]?.detail,
    ).toContain("CARTO");
  });

  it("reads the same style URL the app uses", () => {
    expect(basemapStyleUrl()).toBe(BASEMAP_STYLE_URL);
  });
});
