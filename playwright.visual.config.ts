import { defineConfig, devices } from "@playwright/test";

// Screenshot harness: output only, never part of `pnpm check` or CI gating.
// It starts its own dev server (never reuses one: another worktree's server
// would serve different code). FLUSTER_VISUAL_PORT moves it off 1430.
const port = Number(process.env.FLUSTER_VISUAL_PORT ?? 1430);

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
    baseURL: `http://127.0.0.1:${port}`,
    colorScheme: "dark",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  },
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
  projects: [{ name: "visual", use: { ...devices["Desktop Chrome"] } }],
});
