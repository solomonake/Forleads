import { test, expect, type Page } from "@playwright/test";
import { BASEMAP_STYLE_URL } from "../src/lib/map/basemap";

// Production-build smoke for the basemap (run by playwright.smoke.config.ts).
// No sign-in, and no Supabase or Nominatim traffic: the page is loaded and the
// map is watched, nothing is searched.

const WORKER_PATH = "/vendor/maplibre/maplibre-gl-worker.mjs";
const FORBIDDEN_HOSTS = /supabase\.(co|in)|nominatim/i;
// @vercel/analytics requests its script from /_vercel/insights, which only
// exists on Vercel. Locally that is a 404, and the only console error allowed.
const EXPECTED_LOCAL_404 = /\/_vercel\/insights\//;

// Collects CSP violations the browser raises, report-only ones included, as
// they happen (the Reporting API batches its POSTs, so don't wait on those).
async function watchCsp(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
    document.addEventListener("securitypolicyviolation", (event) => {
      seen.push(`${event.effectiveDirective} ${event.blockedURI} (${event.disposition})`);
    });
  });
  const reports: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/csp-report") reports.push(request.postData() ?? "");
  });
  return {
    reports,
    violations: () =>
      page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations),
  };
}

function watchPage(page: Page) {
  const consoleErrors: string[] = [];
  const forbiddenRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const where = message.location().url ?? "";
    if (EXPECTED_LOCAL_404.test(where) || EXPECTED_LOCAL_404.test(message.text())) return;
    consoleErrors.push(`${message.text()} (${where})`);
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("request", (request) => {
    if (FORBIDDEN_HOSTS.test(new URL(request.url()).host)) forbiddenRequests.push(request.url());
  });
  return { consoleErrors, forbiddenRequests };
}

test("map worker is served as JavaScript", async ({ request }) => {
  const response = await request.get(WORKER_PATH);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/javascript/);
});

test("security headers are set on the page and the worker", async ({ request }) => {
  for (const path of ["/", WORKER_PATH]) {
    const headers = (await request.get(path)).headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"], path).toContain("camera=()");
    expect(headers["content-security-policy"], path).toBe("frame-ancestors 'none'");
    const csp = headers["content-security-policy-report-only"] ?? "";
    expect(csp, path).toContain("default-src 'self'");
    expect(csp, path).toContain("worker-src 'self' blob:");
    expect(csp, path).toContain("https://tiles.openfreemap.org");
    expect(csp, path).toContain("report-uri /api/csp-report");
  }
});

test("basemap renders with its style and attribution, and no console errors", async ({ page }) => {
  const csp = await watchCsp(page);
  const watched = watchPage(page);
  const styleResponse = page.waitForResponse((response) => response.url() === BASEMAP_STYLE_URL, {
    timeout: 30_000,
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const style = await styleResponse;
  expect(style.status()).toBe(200);
  expect(style.headers()["content-type"]).toMatch(/json/);

  const map = page.locator("#map");
  await expect(map.locator("canvas.maplibregl-canvas")).toBeVisible();
  // Set from MapLibre's style.load event: the real style loaded, not the fallback.
  await expect(map).toHaveAttribute("data-basemap", "ready");

  // The OSM/OpenMapTiles credit arrives with the TileJSON. The compact control
  // may start collapsed; open it if so.
  const attribution = map.locator(".maplibregl-ctrl-attrib-inner");
  await expect(attribution).toContainText("OpenStreetMap");
  await expect(attribution).toContainText("OpenMapTiles");
  if (!(await attribution.isVisible())) {
    await map.locator(".maplibregl-ctrl-attrib-button").click();
  }
  await expect(attribution).toBeVisible();

  // Let the first tiles settle so late errors are caught.
  await page.waitForLoadState("networkidle").catch(() => undefined);

  expect(watched.forbiddenRequests).toEqual([]);
  expect(watched.consoleErrors).toEqual([]);
  // The report-only CSP would not block anything the map needs.
  expect(await csp.violations()).toEqual([]);
  expect(csp.reports).toEqual([]);
});

test("aerial imagery loads without a CSP violation", async ({ page }) => {
  const csp = await watchCsp(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const map = page.locator("#map");
  await expect(map).toHaveAttribute("data-basemap", "ready");
  // The setup checklist is open on first load; the toggle must stay clickable.
  await expect(page.getByRole("region", { name: "Getting started checklist" })).toBeVisible();
  const aerialTile = page.waitForResponse((r) => r.url().startsWith("https://server.arcgisonline.com/"));
  await page.getByRole("button", { name: "Toggle aerial imagery" }).click();
  expect((await aerialTile).ok()).toBe(true);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  expect(await csp.violations()).toEqual([]);
});

test("a failed basemap style falls back to aerial imagery and says so", async ({ page }) => {
  watchPage(page);
  await page.route(BASEMAP_STYLE_URL, (route) =>
    route.fulfill({ status: 503, contentType: "text/plain", body: "unavailable" })
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const map = page.locator("#map");
  await expect(map).toHaveAttribute("data-basemap", "fallback");
  await expect(map.locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect(page.locator("#toast.err")).toContainText("Showing aerial imagery instead");
  await expect(page.getByRole("button", { name: "Toggle aerial imagery" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});
