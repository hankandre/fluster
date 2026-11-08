import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "visual/**",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:1420", trace: "on-first-retry" },
  webServer: [
    {
      command: "pnpm dev",
      url: "http://127.0.0.1:1420",
      reuseExistingServer: !process.env.CI,
    },
    {
      // A second dev server, built with the test-only HLS engine. Only the
      // conversion journeys use it; the engine is chosen at build time.
      command: "pnpm exec vite --port 1421",
      url: "http://127.0.0.1:1421",
      env: { VITE_FLUSTER_E2E_ENGINE: "fake-hls" },
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: "chromium", testIgnore: /conversion\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "chromium-fake-hls",
      testMatch: /conversion\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:1421" },
    },
  ],
});
