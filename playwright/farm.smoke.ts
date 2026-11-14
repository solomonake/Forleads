import { test, expect } from "@playwright/test";

// Browser/UI verification with intercepted API seams. No live writes/providers.
test("CSV partial recovery survives Board and navigation, never repeats saved rows", async ({ page }) => {
  const saved: Array<Record<string, unknown>> = [];
  let reads = 0, fail = true, release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/auth/session", route => route.fulfill({ json: { user: { sub: "A", name: "Fixture" } } }));
  await page.route("**/api/leads", route => { reads++; return route.fulfill({ json: { leads: saved } }); });
  await page.route("**/api/geocode?**", route => {
    const address = new URL(route.request().url()).searchParams.get("q")!;
    if (address === "Synthetic 3" && fail) { fail = false; return route.fulfill({ status: 502, json: { error: "fixture unavailable" } }); }
    return route.fulfill({ json: { results: [{ address, lng: 0, lat: 0 }] } });
  });
  await page.route("**/api/lead", async route => {
    const row = route.request().postDataJSON();
    if (row.address === "Synthetic 1") await delayed;
    const lead = { ...row, id: `lead-${saved.length}`, status: "new", first_seen_at: new Date().toISOString(), last_worked_at: new Date().toISOString() };
    saved.push(lead); await route.fulfill({ json: { lead } });
  });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("button", { name: "Farm", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "fixture.csv", mimeType: "text/csv", buffer: Buffer.from("address\nSynthetic 1\nSynthetic 2\nSynthetic 3\nSynthetic 4\n") });
  await expect(page.getByRole("button", { name: "Importing…" })).toBeDisabled();
  await page.getByRole("tab", { name: "Board" }).click();
  await nav.getByRole("button", { name: "Reports", exact: true }).click();
  await nav.getByRole("button", { name: "Farm", exact: true }).click();
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await expect(page.getByRole("button", { name: "Importing…" })).toBeDisabled();
  release();
  await expect(page.getByRole("status")).toContainText("Imported 2");
  await expect(page.getByRole("status")).toContainText("Remaining 2");
  await expect(page.getByTestId("farm-table").locator("tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "Resume remaining rows" }).click();
  await expect(page.getByRole("status")).toContainText("Imported 4");
  expect(saved.map(x => x.address)).toEqual(["Synthetic 1", "Synthetic 2", "Synthetic 3", "Synthetic 4"]);
  expect(reads).toBeGreaterThanOrEqual(3);
});

test("account change pauses remaining rows without sending them to the new account", async ({ page }) => {
  let user = "A", writes = 0;
  await page.route("**/api/auth/session", route => route.fulfill({ json: { user: { sub: user, name: "Fixture" } } }));
  await page.route("**/api/leads", route => route.fulfill({ json: { leads: [] } }));
  await page.route("**/api/lead", route => { writes++; user = "B"; return route.fulfill({ json: { lead: { id: "fixture" } } }); });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Farm", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "fixture.csv", mimeType: "text/csv", buffer: Buffer.from("address,lng,lat\nOne,0,0\nTwo,0,0\n") });
  await expect(page.getByRole("status")).toContainText("Imported 1");
  await expect(page.getByRole("status")).toContainText("account changed");
  await page.getByRole("button", { name: "Resume remaining rows" }).click();
  await expect(page.getByRole("status")).toContainText("account changed");
  expect(writes).toBe(1);
});

test("Farm table, Board and Map navigation work at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.route("**/api/leads", route => route.fulfill({ json: { leads: [{ id: 'fixture', address: 'Synthetic property', lng: 0, lat: 0, status: 'new', first_seen_at: new Date().toISOString(), last_worked_at: new Date().toISOString() }] } }));
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("button", { name: "Farm", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Table", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("farm-table")).toBeVisible();
  await page.getByRole("tab", { name: "Board" }).click();
  await expect(page.locator(".kcard")).toHaveCount(1);
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await page.getByRole("button", { name: "Map", exact: true }).last().click();
  await expect(nav.getByRole("button", { name: "Map", exact: true })).toHaveAttribute("aria-current", "page");
});
