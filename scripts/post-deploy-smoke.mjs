#!/usr/bin/env node
// Post-deploy smoke (G11): a tiny read-only check of a deployed Forleads.
//
//   node scripts/post-deploy-smoke.mjs https://forleads.vercel.app
//
// GET only, no credentials, no sign-in, nothing written. Checks:
//   1. `/` returns 200 and carries the security headers (next.config.mjs).
//   2. `/api/health` returns 200 with ok: true. `degraded` is printed, not failed.
//   3. The basemap style JSON returns 200, and its vector TileJSON returns 200
//      (not the retired CARTO watermark tiles).
// Exits 1 if any check fails. Run by .github/workflows/post-deploy-smoke.yml.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 15_000;
const UA = "Forleads post-deploy smoke (+https://github.com/solomonake/Forleads)";

/** BASEMAP_STYLE_URL read from the source, so the smoke can't drift from the app. */
export function basemapStyleUrl(source = readFileSync(path.join(HERE, "../src/lib/map/basemap.ts"), "utf8")) {
  const m = source.match(/export const BASEMAP_STYLE_URL\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("BASEMAP_STYLE_URL not found in src/lib/map/basemap.ts");
  return m[1];
}

export const REQUIRED_HEADERS = {
  "x-content-type-options": (v) => v === "nosniff",
  "x-frame-options": (v) => v === "DENY",
  "referrer-policy": (v) => v === "strict-origin-when-cross-origin",
  "content-security-policy": (v) => /frame-ancestors 'none'/.test(v),
  "strict-transport-security": (v) => /max-age=\d+/.test(v),
};

async function get(fetchImpl, url, accept) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      headers: { "User-Agent": UA, Accept: accept },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} baseUrl
 * @param {{ fetchImpl?: typeof fetch, styleUrl?: string }} [options]
 * @returns {Promise<{ name: string, ok: boolean, detail: string }[]>}
 */
export async function runSmoke(baseUrl, { fetchImpl = fetch, styleUrl = basemapStyleUrl() } = {}) {
  const base = baseUrl.replace(/\/$/, "");
  const results = [];
  const check = async (name, fn) => {
    try {
      const detail = await fn();
      results.push({ name, ok: true, detail: detail ?? "ok" });
    } catch (error) {
      results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  };

  await check("home page 200", async () => {
    const res = await get(fetchImpl, `${base}/`, "text/html");
    if (res.status !== 200) throw new Error(`/ returned ${res.status}`);
    const missing = Object.entries(REQUIRED_HEADERS)
      .filter(([name, ok]) => !ok(res.headers.get(name) ?? ""))
      .map(([name]) => name);
    if (missing.length) throw new Error(`/ is missing or has unexpected security headers: ${missing.join(", ")}`);
    return "200 with security headers";
  });

  await check("health ok", async () => {
    const res = await get(fetchImpl, `${base}/api/health`, "application/json");
    const body = await res.json().catch(() => null);
    if (res.status !== 200) throw new Error(`/api/health returned ${res.status}${body?.error ? ` (${body.error})` : ""}`);
    if (body?.ok !== true) throw new Error(`/api/health ok is ${JSON.stringify(body?.ok)}`);
    const degraded = Array.isArray(body.degraded) && body.degraded.length ? ` (degraded: ${body.degraded.join(", ")})` : "";
    return `200, ok: true${degraded}`;
  });

  await check("basemap style and tiles", async () => {
    const res = await get(fetchImpl, styleUrl, "application/json");
    if (res.status !== 200) throw new Error(`style ${styleUrl} returned ${res.status}`);
    const style = await res.json().catch(() => null);
    const sources = Object.values(style?.sources ?? {});
    if (!sources.length) throw new Error("style JSON has no sources");
    const tilejson = sources.find((s) => s && typeof s.url === "string")?.url;
    if (tilejson) {
      const tj = await get(fetchImpl, tilejson, "application/json");
      if (tj.status !== 200) throw new Error(`TileJSON ${tilejson} returned ${tj.status}`);
      const body = await tj.json().catch(() => null);
      if (!Array.isArray(body?.tiles) || !body.tiles.length) throw new Error("TileJSON lists no tiles");
      if (body.tiles.some((t) => /cartocdn\.com/.test(t))) throw new Error("TileJSON points at retired CARTO tiles");
    }
    return `style 200${tilejson ? ", TileJSON 200" : ""}`;
  });

  return results;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const target = process.argv[2] || process.env.SMOKE_URL;
  if (!target) {
    console.error("usage: node scripts/post-deploy-smoke.mjs <base-url>");
    process.exit(2);
  }
  const results = await runSmoke(target);
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}: ${r.detail}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `${failed} of ${results.length} checks failed against ${target}` : `all ${results.length} checks passed against ${target}`);
  process.exit(failed ? 1 : 0);
}
