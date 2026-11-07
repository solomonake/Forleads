// G7 (audit 2026-11-07): the app shipped with HSTS only. These pin the headers
// next.config.mjs applies to every route and the report-only CSP allowlist.
import { describe, expect, it } from "vitest";
import {
  CSP_ENFORCE,
  cspDirectives,
  securityHeaders,
} from "../../security-headers.mjs";
// @ts-expect-error -- next.config.mjs is plain JS with no type declarations
import nextConfig from "../../next.config.mjs";
import { BASEMAP_STYLE_URL, SATELLITE_SOURCE } from "@/lib/map/basemap";

function header(list: { key: string; value: string }[], key: string) {
  return list.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;
}

describe("security headers", () => {
  it("next.config applies them to every route", async () => {
    const config = (nextConfig as unknown as (phase: string) => { headers: () => Promise<unknown> })(
      "phase-production-server"
    );
    const rules = (await config.headers()) as { source: string; headers: { key: string; value: string }[] }[];
    expect(rules).toHaveLength(1);
    expect(rules[0]!.source).toBe("/:path*");
    expect(header(rules[0]!.headers, "X-Content-Type-Options")).toBe("nosniff");
  });

  it("enforces nosniff, no framing, referrer trimming and a Permissions-Policy", () => {
    const h = securityHeaders();
    expect(header(h, "X-Content-Type-Options")).toBe("nosniff");
    expect(header(h, "X-Frame-Options")).toBe("DENY");
    expect(header(h, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header(h, "Permissions-Policy")).toMatch(/camera=\(\)/);
    expect(header(h, "Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  it("ships the main CSP as report-only until it's flipped", () => {
    expect(CSP_ENFORCE).toBe(false);
    const csp = header(securityHeaders(), "Content-Security-Policy-Report-Only")!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("report-uri /api/csp-report");
    const enforced = securityHeaders({ enforce: true });
    expect(header(enforced, "Content-Security-Policy-Report-Only")).toBeUndefined();
    expect(header(enforced, "Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(header(enforced, "Content-Security-Policy")).toContain("default-src 'self'");
  });

  it("allows every host the map and imagery load from", () => {
    const d = cspDirectives();
    const basemapOrigin = new URL(BASEMAP_STYLE_URL).origin;
    const aerialOrigin = new URL(SATELLITE_SOURCE.tiles[0]).origin;
    for (const origin of [basemapOrigin, aerialOrigin]) {
      expect(d["connect-src"]).toContain(origin);
      expect(d["img-src"]).toContain(origin);
    }
    expect(d["worker-src"]).toEqual(["'self'", "blob:"]);
    expect(d["img-src"]).toEqual(expect.arrayContaining(["data:", "blob:", "https://*.mapillary.com"]));
    expect(d["connect-src"]).toContain("https://*.supabase.co");
    expect(d["form-action"]).toContain("https://accounts.google.com");
    expect(d["script-src"]).toContain("https://va.vercel-scripts.com");
  });

  it("only allows eval and websockets under next dev", () => {
    expect(cspDirectives()["script-src"]).not.toContain("'unsafe-eval'");
    expect(cspDirectives({ dev: true })["script-src"]).toContain("'unsafe-eval'");
    expect(cspDirectives()["connect-src"]).not.toContain("ws:");
  });
});
