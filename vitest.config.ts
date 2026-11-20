import { defineConfig } from "vitest/config";

// The core's tests run in Node: no DOM, no browser globals.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/integration/**/*.test.ts", "scripts/**/*.test.ts"],
    coverage: { reporter: ["text", "html"] },
  },
});
