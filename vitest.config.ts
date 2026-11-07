import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // Node 25+ adds a global localStorage that is undefined without
    // --localstorage-file and shadows jsdom's; tests use jsdom's storage.
    execArgv: ["--no-experimental-webstorage"],
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/integration/**/*.test.ts"],
    coverage: { reporter: ["text", "html"] },
  },
});
