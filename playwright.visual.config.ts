import { defineConfig, devices } from "@playwright/test";

// Screenshot harness: output only, never part of `pnpm check` or CI gating.
export default defineConfig({
  testDir: "./e2e/visual",
  globalSetup: "./e2e/visual/global-setup.ts",
  outputDir: "./test-results/visual-run",
  fullyParallel: true,
  workers: process.env.CI ? 1 : 4,
  retries: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:1420",
    colorScheme: "dark",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "visual", use: { ...devices["Desktop Chrome"] } }],
});
