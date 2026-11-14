import { defineConfig, devices } from "@playwright/test";

// Map smoke against a production build: `npm run build`, then `npm run smoke:map`.
// It serves `next start` (never `next dev`) on its own port so it can't reuse a
// dev server. Only *.smoke.ts files run here; the demo config runs *.spec.ts.
const port = Number(process.env.SMOKE_PORT || 3100);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./playwright",
  testMatch: "**/*.smoke.ts",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  outputDir: ".playwright/smoke",
  webServer: {
    command: `npx next start --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
    // Keep the server off Supabase and Nominatim even if a .env file is present.
    env: {
      FORLEADS_PERSIST: "memory",
      FORLEADS_GEOCODER: "mock",
      FORLEADS_AGENT_MODE: "mock",
    },
  },
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
