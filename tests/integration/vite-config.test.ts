// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertNoTestEngine } from "../../vite.config";

describe("vite config", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses a build when the test engine flag is set", () => {
    vi.stubEnv("VITE_FLUSTER_E2E_ENGINE", "fake-hls");
    expect(() => assertNoTestEngine("build", "production")).toThrow(/test-only player engine/);
  });

  it("allows the e2e dev server and a clean build", () => {
    vi.stubEnv("VITE_FLUSTER_E2E_ENGINE", "fake-hls");
    expect(() => assertNoTestEngine("serve", "development")).not.toThrow();
    vi.stubEnv("VITE_FLUSTER_E2E_ENGINE", "");
    expect(() => assertNoTestEngine("build", "production")).not.toThrow();
  });
});
