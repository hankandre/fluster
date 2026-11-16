import { defineConfig, devices } from "@playwright/test";
import { checkE2ePorts, e2ePorts } from "./scripts/e2e-ports.mjs";

// Each run starts its own dev servers and never reuses one already listening:
// a server left running from another worktree would serve different code.
// Set FLUSTER_E2E_PORT to run several worktrees side by side; the fake-HLS
// server takes the next port. The check runs once, in the process that starts
// the servers; workers inherit the marker and must not probe ports the servers now hold.
const { app: port, fakeHls: fakeHlsPort } = process.env.FLUSTER_E2E_PORTS_CHECKED
  ? e2ePorts(process.env.FLUSTER_E2E_PORT)
  : await checkE2ePorts(process.env.FLUSTER_E2E_PORT);
process.env.FLUSTER_E2E_PORTS_CHECKED = "1";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "visual/**",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "on-first-retry" },
  webServer: [
    {
      command: `pnpm exec vite --port ${port} --strictPort`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
    },
    {
      // A second dev server, built with the test-only HLS engine. Only the
      // conversion journeys use it; the engine is chosen at build time.
      command: `pnpm exec vite --port ${fakeHlsPort} --strictPort`,
      url: `http://127.0.0.1:${fakeHlsPort}`,
      env: { VITE_FLUSTER_E2E_ENGINE: "fake-hls" },
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: "chromium", testIgnore: [/conversion\.spec\.ts/, /visual\//], use: { ...devices["Desktop Chrome"] } },
    {
      name: "chromium-fake-hls",
      testMatch: /conversion\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${fakeHlsPort}` },
    },
  ],
});
