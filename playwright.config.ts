import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PR_DEMO_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./playwright",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  outputDir: ".playwright/videos",
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    video: { mode: "on", size: { width: 1280, height: 800 } },
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
