import { test, expect, type Page } from "@playwright/test";

// Accessibility smoke against a production build (run by
// playwright.smoke.config.ts). axe-core (WCAG 2.0-2.2 A/AA plus best practice)
// runs on every public route and every nav tab, and on the lead rail while the
// signed-out sign-in panel is open. Serious and critical violations fail;
// moderate and minor ones are printed so they stay visible.

// Resolved from node_modules at run time; nothing is fetched from a CDN.
const AXE_PATH = require.resolve("axe-core/axe.min.js");

const NAV_TABS = ["Prospect", "Approvals", "Autopilot", "Deals", "Connect", "Recap"] as const;
const BLOCKING = new Set(["serious", "critical"]);

type AxeResult = {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string[] }[];
};

async function runAxe(page: Page): Promise<AxeResult[]> {
  // Scan the settled UI: mid-fade panels and nav colour transitions read as
  // low contrast otherwise.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)))
  );
  if (!(await page.evaluate(() => "axe" in window))) {
    await page.addScriptTag({ path: AXE_PATH });
  }
  return page.evaluate(async () => {
    const axe = (window as unknown as {
      axe: { run: (ctx: Document, opts: unknown) => Promise<{ violations: AxeResult[] }> };
    }).axe;
    const result = await axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
      },
      resultTypes: ["violations"],
    });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => ({ target: n.target })),
    }));
  });
}

function describe(violations: AxeResult[]) {
  return violations.map(
    (v) => `${v.impact} ${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`
  );
}

async function expectNoBlocking(page: Page, where: string) {
  const violations = await runAxe(page);
  const blocking = violations.filter((v) => BLOCKING.has(v.impact ?? ""));
  const advisory = violations.filter((v) => !BLOCKING.has(v.impact ?? ""));
  if (advisory.length) console.log(`[axe advisory] ${where}\n  ${describe(advisory).join("\n  ")}`);
  expect(describe(blocking), `serious/critical axe violations on ${where}`).toEqual([]);
  // Pinch zoom must stay available (WCAG 1.4.4); axe rates this one moderate.
  expect(violations.map((v) => v.id), `${where} disables zoom`).not.toContain("meta-viewport");
}

async function hydrated(page: Page, path = "/") {
  const session = page.waitForResponse((r) => r.url().includes("/api/auth/session"));
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await session;
}

test.beforeEach(async ({ page }) => {
  await page.route(/accounts\.google\.com/, (route) => route.abort());
});

for (const path of ["/privacy", "/terms"]) {
  test(`axe: ${path} has no serious or critical violations`, async ({ page }) => {
    await page.goto(path, { waitUntil: "load" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expectNoBlocking(page, path);
  });
}

test("axe: every nav tab has one h1, aria-current, and no serious or critical violations", async ({ page }) => {
  await hydrated(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const tab of NAV_TABS) {
    const button = nav.getByRole("button", { name: tab, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-current", "page");
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    // Let the panel's data load settle so its empty state is what gets scanned.
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await expectNoBlocking(page, `/ (${tab})`);
  }
});

test("the lead rail scrolls from the keyboard and passes axe with the sign-in panel open", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await hydrated(page);
  const search = page.locator("#search-input");
  await search.click();
  await search.fill("12 Oak Street");
  await page.locator("#suggest .sug", { hasText: "12 Oak Street" }).first().click();
  await expect(page.getByTestId("auth-gate")).toBeVisible();

  const body = page.getByRole("region", { name: /Lead details/ });
  await expect(body).toHaveAttribute("tabindex", "0");
  await body.focus();
  await expect(body).toBeFocused();
  const scrollable = await body.evaluate((el) => el.scrollHeight > el.clientHeight);
  if (scrollable) {
    await page.keyboard.press("PageDown");
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  }
  await expectNoBlocking(page, "/ (lead rail, signed out)");
});

test("the viewport allows pinch zoom", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const content = (await page.locator('meta[name="viewport"]').getAttribute("content")) ?? "";
  expect(content).not.toMatch(/user-scalable\s*=\s*(no|0)/i);
  expect(content).not.toMatch(/maximum-scale/i);
});
