import { test, expect } from "@playwright/test";

// Canonical Forleads first-flow demo. Records video for PR handoff.
// Selectors mirror src/components/MapWorkspace.tsx — keep in sync if that file moves.

test("Forleads first flow: address → fly-to → grade chips → knocked → draft", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const search = page.locator("#search-input");
  await expect(search).toBeVisible();

  // Type an address; suggestions are seeded client-side, so first suggestion appears fast.
  await search.click();
  await search.fill("1");
  const firstSuggestion = page.locator("#suggest .sug").first();
  await expect(firstSuggestion).toBeVisible();
  await firstSuggestion.click();

  // Fly-to + scouts run; lead rail opens and at least one grade chip appears.
  const leadRail = page.locator("#lead.open");
  await expect(leadRail).toBeVisible({ timeout: 30_000 });
  await expect(leadRail.getByText("Grounded", { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(leadRail.locator(".card .chip").first()).toBeVisible();

  // Trigger the note → next-best-action loop via the "Knocked, no answer" quick chip.
  const knocked = page.locator(".quick button", { hasText: "Knocked, no answer" });
  await expect(knocked).toBeVisible();
  const [noteResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/notes")),
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
  await draftBtn.click();

  // ReviewTray opens with the compliant draft.
  await expect(page.locator(".overlay .draft")).toBeVisible({ timeout: 30_000 });

  // Hold a beat so the recording captures the final frame.
  await page.waitForTimeout(1500);
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
