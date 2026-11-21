import { defineConfig } from "vitest/config";

// The root suite: scripts, workflow and tripwire-rule tests. The core's own suite is packages/core/vitest.config.ts.
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: { reporter: ["text", "html"] },
  },
});
