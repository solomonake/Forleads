import { test, expect, type Page } from "@playwright/test";

// Signed-out address flow against a production build (run by
// playwright.smoke.config.ts, which serves `next start` with demo writes off
// and Google sign-in unconfigured). No sign-in, no Supabase, no live geocoder:
// the smoke server uses the mock gazetteer.

const ADDRESS = "12 Oak Street";

async function hydrated(page: Page, path = "/") {
  const session = page.waitForResponse((r) => r.url().includes("/api/auth/session"));
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await session;
}

async function pickAddress(page: Page) {
  const search = page.locator("#search-input");
  await search.click();
  await search.fill(ADDRESS);
  const suggestion = page.locator("#suggest .sug", { hasText: ADDRESS }).first();
  await expect(suggestion).toBeVisible();
  const lead = page.waitForResponse((r) => r.url().endsWith("/api/lead"));
  await suggestion.click();
  return lead;
}

test.beforeEach(async ({ page }) => {
  // Belt and braces: never leave localhost for Google, even if a future
  // smoke env had OAuth configured.
  await page.route(/accounts\.google\.com/, (route) => route.abort());
});

test("signed-out visitor who picks an address gets a persistent sign-in panel", async ({ page }) => {
  const geocodeCalls: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/geocode") geocodeCalls.push(r.url());
  });
  await hydrated(page);
  const lead = await pickAddress(page);
  expect((await lead).status()).toBe(401);
  // One debounced lookup for the typed text; picking it costs nothing more (G3).
  await page.waitForTimeout(1_000);
  expect(geocodeCalls).toHaveLength(1);

  const rail = page.locator("#lead.open");
  const gate = rail.getByRole("region", { name: "Research needs a Forleads workspace" });
  await expect(gate).toBeVisible();
  await expect(rail.locator(".lead-addr")).toHaveText(ADDRESS);
  await expect(gate).toContainText(ADDRESS);

  const cta = gate.getByRole("link", { name: "Continue with Google" });
  await expect(cta).toHaveAttribute("href", "/api/auth/google/login");

  // Persistent: still there well after the old 3.5 s toast would have gone,
  // and the rail did not close.
  await page.waitForTimeout(10_500);
  await expect(gate).toBeVisible();
  await expect(rail).toBeVisible();
  await expect(page.locator("#toast.show")).toHaveCount(0);

  // The note box is hidden while research is gated.
  await expect(page.locator("#lead-note")).toBeHidden();
});

test("the chosen address survives the sign-in round trip", async ({ page }) => {
  await hydrated(page);
  await pickAddress(page);
  const gate = page.getByTestId("auth-gate");
  await expect(gate).toBeVisible();

  // OAuth isn't configured on the smoke server, so login bounces straight back
  // to /?auth=not_configured: the same path a cancelled sign-in takes.
  await Promise.all([
    page.waitForURL(/\/(\?.*)?$/),
    gate.getByRole("link", { name: "Continue with Google" }).click(),
  ]);
  await expect(page.getByTestId("auth-gate")).toBeVisible();
  await expect(page.locator("#lead.open .lead-addr")).toHaveText(ADDRESS);

  // "Not now" forgets it for good.
  await page.getByTestId("auth-gate").getByRole("button", { name: "Not now" }).click();
  await expect(page.locator("#lead.open")).toHaveCount(0);
  await hydrated(page);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("auth-gate")).toHaveCount(0);
});

test("at 375 px the account button does not cover the search field", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await hydrated(page);
  const signin = page.locator(".account-signin");
  await expect(signin).toBeVisible();
  const input = await page.locator("#cmd .pill").boundingBox();
  const button = await signin.boundingBox();
  expect(input && button).toBeTruthy();
  // No horizontal overlap between the search pill and the account button.
  expect(input!.x + input!.width).toBeLessThanOrEqual(button!.x);
  await expect(signin).toHaveAccessibleName(/Continue with Google/);
});

test("only one onboarding surface shows over the map at a time", async ({ page }) => {
  await hydrated(page);
  const checklist = page.getByRole("region", { name: "Getting started checklist" });
  await expect(checklist).toBeVisible();
  await expect(page.locator(".launchpad")).toHaveCount(0);

  await page.locator('.getstart-min[title="Minimize"]').click();
  await expect(page.locator(".getstart-chip")).toBeVisible();
  await expect(page.locator(".launchpad")).toBeVisible();
  await expect(checklist).toHaveCount(0);
});

test("Autopilot: Run now with no lead is disabled and says what to do (G14)", async ({ page }) => {
  await hydrated(page);
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Autopilot", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Autopilot" })).toBeVisible();
  const runNow = page.getByRole("button", { name: "Run now" }).first();
  await expect(runNow).toBeDisabled();
  await expect(runNow).toHaveAccessibleDescription(/Run now needs a grounded lead/);
  const why = page.getByTestId("run-needs-lead");
  await expect(why).toBeVisible();
  // The call to action goes back to the map, where the address search is.
  await why.getByRole("button", { name: "Ground an address" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /prospect any address/ })).toBeAttached();
  await expect(page.locator("#search-input")).toBeVisible();
});

test("Recap never recommends a blocked connector (G14)", async ({ page }) => {
  await hydrated(page);
  const report = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/report");
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Recap", exact: true }).click();
  expect((await report).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Recommended next moves" })).toBeVisible();
  // Follow Up Boss is Blocked on this server (no X-System credentials), and
  // Google sign-in is not configured, so neither may be suggested.
  const panel = page.locator(".panel");
  await expect(panel).not.toContainText("Follow Up Boss");
  await expect(panel).not.toContainText("Connect Google");
});
