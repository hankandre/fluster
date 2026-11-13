import { defineConfig, devices } from "@playwright/test";

// Screenshot harness. CI compares every capture with e2e/visual/baselines/ and
// fails on any difference; locally, comparing is opt-in (FLUSTER_VISUAL_COMPARE=1).
// Baselines come only from `pnpm test:visual:accept`, never from a local run.
// It starts its own dev server (never reuses one: another worktree's server
// would serve different code). FLUSTER_VISUAL_PORT moves it off 1430.
const port = Number(process.env.FLUSTER_VISUAL_PORT ?? 1430);
const compare = Boolean(process.env.CI) || process.env.FLUSTER_VISUAL_COMPARE === "1";

export default defineConfig({
  testDir: "./e2e/visual",
  globalSetup: "./e2e/visual/global-setup.ts",
  outputDir: "./test-results/visual-run",
  fullyParallel: true,
  workers: process.env.CI ? 1 : 4,
  retries: 1,
  // A capture that differs and then matches on the retry is nondeterminism: fail it in CI.
  failOnFlakyTests: Boolean(process.env.CI),
  snapshotPathTemplate: "{testDir}/baselines/{arg}{ext}",
  // Never write a baseline from a test run (local or CI).
  updateSnapshots: compare ? "none" : "missing",
  expect: { toMatchSnapshot: { threshold: 0.2, maxDiffPixels: 0 } },
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
