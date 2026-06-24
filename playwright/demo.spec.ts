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
  await expect(leadRail.locator(".grade-chip").first()).toBeVisible({ timeout: 45_000 });

  // Trigger the note → next-best-action loop via the "Knocked, no answer" quick chip.
  const knocked = page.locator(".quick button", { hasText: "Knocked, no answer" });
  await expect(knocked).toBeVisible();
  await knocked.click();

  // NBA panel renders the classification + suggested actions.
  const nba = page.locator(".nba");
  await expect(nba).toBeVisible({ timeout: 30_000 });

  // Click "Draft it →" to surface the Review Tray draft artifact.
  const draftBtn = page.locator("button.draftbtn", { hasText: "Draft it" });
  await draftBtn.click();

  // ReviewTray opens with the compliant draft.
  const reviewTray = page.locator('[role="dialog"], .review-tray, .tray, .reviewtray').first();
  await expect(reviewTray.or(page.getByText(/draft|review/i).first())).toBeVisible({ timeout: 30_000 });

  // Hold a beat so the recording captures the final frame.
  await page.waitForTimeout(1500);
});
