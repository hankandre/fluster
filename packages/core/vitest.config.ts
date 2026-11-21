import { defineConfig } from "vitest/config";

// The core's tests run in Node: no DOM, no browser globals.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
