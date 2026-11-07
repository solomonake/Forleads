// Security response headers, applied to every route by next.config.mjs.
//
// Enforced now: nosniff, no framing (X-Frame-Options + CSP frame-ancestors),
// referrer trimming and a minimal Permissions-Policy. These can't break a page
// that isn't being framed.
//
// The main Content-Security-Policy ships as REPORT-ONLY: browsers evaluate it,
// report what it would block to /api/csp-report, and block nothing. Once the
// reports are clean in production, flip it to enforce by setting
// CSP_ENFORCE = true below (it moves the policy to the Content-Security-Policy
// header). See the PR for the checklist.
//
// Every external host here comes from the code, not from env values:
// - tiles.openfreemap.org: basemap style, TileJSON, vector tiles, glyphs and
//   sprites (src/lib/map/basemap.ts BASEMAP_STYLE_URL).
// - server.arcgisonline.com: Esri aerial raster tiles (SATELLITE_SOURCE).
// - *.mapillary.com and *.fbcdn.net: Mapillary street-imagery thumbnails shown
//   in the lead rail (MapillaryImageryProvider; Mapillary serves thumb URLs
//   from Meta's CDN).
// - *.googleusercontent.com: the signed-in user's Google avatar (AccountBar).
// - accounts.google.com: Google OAuth consent (src/lib/auth/google.ts). It is
//   reached by redirect, which connect-src doesn't govern; form-action covers a
//   form post to it.
// - *.supabase.co: Supabase project hosts (the code's pattern, see
//   playwright/map.smoke.ts). The browser doesn't call Supabase today; all
//   reads/writes are server-side. Listed so a client SDK or realtime channel
//   wouldn't be silently blocked once enforced.
// - va.vercel-scripts.com / vitals.vercel-insights.com: @vercel/analytics. In
//   production the script and beacons are same-origin (/_vercel/insights).
// - 'self' covers /vendor/maplibre/maplibre-gl-worker.mjs, the MapLibre worker
//   (worker-src also allows blob: for MapLibre's fallback worker).
//
// 'unsafe-inline' in script-src: the App Router streams inline bootstrap
// scripts (self.__next_f.push) and there's no nonce middleware yet. Moving to
// nonces is a follow-up; it needs dynamic rendering of every page.

/** Flip to true once production CSP reports are clean. */
export const CSP_ENFORCE = false;

export const CSP_REPORT_PATH = "/api/csp-report";

const MAP_HOSTS = ["https://tiles.openfreemap.org", "https://server.arcgisonline.com"];
const MAPILLARY_HOSTS = ["https://*.mapillary.com", "https://*.fbcdn.net"];
const SUPABASE_HOSTS = ["https://*.supabase.co", "wss://*.supabase.co"];
const GOOGLE_AVATAR_HOSTS = ["https://*.googleusercontent.com"];
const GOOGLE_OAUTH_HOSTS = ["https://accounts.google.com"];
const VERCEL_INSIGHTS_HOSTS = ["https://va.vercel-scripts.com", "https://vitals.vercel-insights.com"];

/**
 * @param {{ dev?: boolean }} [options] dev adds what `next dev` needs (eval for
 *   React refresh, websocket HMR) so local runs don't flood the report.
 * @returns {Record<string, string[]>}
 */
export function cspDirectives({ dev = false } = {}) {
  return {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(dev ? ["'unsafe-eval'"] : []),
      "https://va.vercel-scripts.com",
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      ...MAP_HOSTS,
      ...MAPILLARY_HOSTS,
      ...GOOGLE_AVATAR_HOSTS,
    ],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      ...MAP_HOSTS,
      ...MAPILLARY_HOSTS,
      ...SUPABASE_HOSTS,
      ...VERCEL_INSIGHTS_HOSTS,
      ...(dev ? ["ws:"] : []),
    ],
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    "frame-src": ["'none'"],
    "manifest-src": ["'self'"],
    "media-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", ...GOOGLE_OAUTH_HOSTS],
    "frame-ancestors": ["'none'"],
    "report-uri": [CSP_REPORT_PATH],
    "report-to": ["csp"],
  };
}

/** @param {Record<string, string[]>} directives */
export function serializeCsp(directives) {
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/**
 * Headers for every route.
 * @param {{ dev?: boolean, enforce?: boolean }} [options]
 * @returns {{ key: string, value: string }[]}
 */
export function securityHeaders({ dev = false, enforce = CSP_ENFORCE } = {}) {
  const csp = serializeCsp(cspDirectives({ dev }));
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      // The map's locate control isn't used; nothing needs these. Revisit
      // geolocation if a "near me" control ships.
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    // Enforced even while the main policy is report-only: frame-ancestors is
    // ignored in a Report-Only header.
    ...(enforce ? [] : [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }]),
    { key: "Reporting-Endpoints", value: `csp="${CSP_REPORT_PATH}"` },
    {
      key: enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
      value: csp,
    },
  ];
}
