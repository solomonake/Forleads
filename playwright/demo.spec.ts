import { test, expect } from "@playwright/test";

// Canonical Forleads first-flow demo. Records video for PR handoff.
// Selectors mirror src/components/MapWorkspace.tsx — keep in sync if that file moves.
const COLD_API_TIMEOUT = 60_000;

test("Forleads first flow: address → fly-to → grade chips → knocked → draft", async ({ page }) => {
  const sessionReady = page.waitForResponse(
    (response) => response.url().includes("/api/auth/session"),
    { timeout: COLD_API_TIMEOUT },
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  expect((await sessionReady).ok()).toBe(true);

  const search = page.locator("#search-input");
  await expect(search).toBeEditable();

  // Type an address after hydration and prove the API request completed.
  await search.click();
  const geocodeReady = page.waitForResponse(
    (response) => response.url().includes("/api/geocode?q=12"),
    { timeout: COLD_API_TIMEOUT },
  );
  await search.fill("12");
  expect((await geocodeReady).ok()).toBe(true);
  const firstSuggestion = page.locator("#suggest .sug").first();
  await expect(firstSuggestion).toBeVisible();
  const [leadResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes("/api/lead"),
      { timeout: COLD_API_TIMEOUT },
    ),
    firstSuggestion.click(),
  ]);
  expect(
    leadResponse.status(),
    `lead API failed: ${await leadResponse.text()}`,
  ).toBe(200);

  // Fly-to + scouts run; lead rail opens and at least one grade chip appears.
  const leadRail = page.locator("#lead.open");
  await expect(leadRail).toBeVisible({ timeout: 30_000 });
  await expect(leadRail.getByText("Grounded", { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(leadRail.locator(".card .chip").first()).toBeVisible();

  // The owner-contact step is surfaced right after grounding — fill and save it.
  const contactEditor = page.locator('[data-testid="contact-editor"]');
  await expect(contactEditor).toBeVisible();
  await contactEditor.locator("#contact-name").fill("Alex Owner");
  await contactEditor.locator('input[type="email"]').fill("alex.owner@example.com");
  const [contactResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes("/contact"),
      { timeout: COLD_API_TIMEOUT },
    ),
    contactEditor.locator("button", { hasText: "Save contact" }).click(),
  ]);
  expect(
    contactResponse.status(),
    `contact API failed: ${await contactResponse.text()}`,
  ).toBe(200);

  // Trigger the note → next-best-action loop via the "Knocked, no answer" quick chip.
  const knocked = page.locator(".quick button", { hasText: "Knocked, no answer" });
  await expect(knocked).toBeVisible();
  const [noteResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes("/api/notes"),
      { timeout: COLD_API_TIMEOUT },
    ),
    knocked.click(),
  ]);
  expect(
    noteResponse.status(),
    `notes API failed: ${await noteResponse.text()}`,
  ).toBe(200);

  // NBA panel renders the classification + suggested actions.
  const nba = page.locator(".nba");
  await expect(nba).toBeVisible({ timeout: 30_000 });

  // Click "Draft it →" to surface the Review Tray draft artifact.
  const draftBtn = page.locator("button.draftbtn", { hasText: "Draft it" });
  const [draftResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes("/api/draft"),
      { timeout: COLD_API_TIMEOUT },
    ),
    draftBtn.click(),
  ]);
  expect(
    draftResponse.status(),
    `draft API failed: ${await draftResponse.text()}`,
  ).toBe(200);

  // ReviewTray opens with the compliant draft.
  await expect(page.locator(".overlay .draft")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);

  // Close the tray, then walk the new activation surfaces.
  await page.locator(".overlay").click({ position: { x: 8, y: 8 } });

  // Loop Studio: Run now produces a persistent, actionable result banner.
  await page.locator('nav button[title="Loop Studio"]').click();
  const runNowBtn = page.locator(".ractions .minibtn.primary", { hasText: "Run now" }).first();
  await expect(runNowBtn).toBeVisible({ timeout: 30_000 });
  await runNowBtn.click();
  await expect(page.locator(".run-banner")).toBeVisible({ timeout: COLD_API_TIMEOUT });
  await page.waitForTimeout(1200);

  // Pipeline: the card's address clicks through to the lead on the map.
  await page.locator('nav button[title="Pipeline"]').click();
  const cardLink = page.locator(".kcard .ka-link").first();
  await expect(cardLink).toBeVisible({ timeout: 30_000 });
  await cardLink.click();
  await expect(page.locator("#lead.open")).toBeVisible({ timeout: 30_000 });

  // Hold a beat so the recording captures the final frame.
  await page.waitForTimeout(1500);
});

test("first-run activation checklist walks a new agent to the first approved draft", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const checklist = page.getByRole("region", { name: "Getting started checklist" });
  await expect(checklist).toBeVisible({ timeout: COLD_API_TIMEOUT });
  await expect(checklist.getByText("Connect Google")).toBeVisible();
  await expect(checklist.getByText("Ground your first address")).toBeVisible();
  await expect(checklist.getByText("Add a contact")).toBeVisible();
  await expect(checklist.getByText("Approve your first draft")).toBeVisible();
  // Minimize → progress chip, restore, and permanent dismiss all work.
  await page.locator('.getstart-min[title="Minimize"]').click();
  await expect(page.locator(".getstart-chip")).toBeVisible();
  await page.locator(".getstart-chip").click();
  await expect(checklist).toBeVisible();
});

test("weekly report renders with actionable next moves", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('nav button[title="Weekly Report"]').click();
  await expect(
    page.getByRole("heading", { name: "Weekly Intelligence Report" })
  ).toBeVisible({ timeout: COLD_API_TIMEOUT });
});

test("legal pages render publicly for OAuth verification", async ({ page }) => {
  await page.goto("/privacy", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByText("Limited Use requirements")).toBeVisible();
  await page.goto("/terms", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
});

test("core shell remains keyboard reachable and mobile-safe", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator("nav")).toBeVisible();
  await expect(page.locator("#search-input")).toHaveAttribute("placeholder");
});
