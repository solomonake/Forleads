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

test("basemap renders with its style and attribution, and no console errors", async ({ page }) => {
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
