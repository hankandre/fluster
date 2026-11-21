// @vitest-environment node
// T2-06 acceptance item 1: the conformance suite runs both shared URL files against whatever URL implementation
// the host supplies, and is exported so the app can run it on a device (T3-02).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, domainToUnicode } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runUrlConformance } from "./url-conformance";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, "../../tests/fixtures");
const NodeURL = URL;

function readFixture(name: string): { vectors: unknown[]; refusals?: unknown[] } {
  return JSON.parse(readFileSync(resolve(FIXTURES, name), "utf8")) as { vectors: unknown[]; refusals?: unknown[] };
}

const hostClasses = readFixture("host-classes.json");
const hlsMasterUrls = readFixture("hls-master-urls.json");
const EXPECTED_TOTAL = hostClasses.vectors.length + hlsMasterUrls.vectors.length + (hlsMasterUrls.refusals ?? []).length;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the URL conformance suite", () => {
  it("counts every vector in both files, so an empty run cannot pass", () => {
    const report = runUrlConformance();
    expect(report.total).toBe(EXPECTED_TOTAL);
    expect(report.total).toBeGreaterThan(150);
  });

  it("is a named export of a module with no test-runner or Node import", () => {
    expect(typeof runUrlConformance).toBe("function");
    const source = readFileSync(resolve(HERE, "url-conformance.ts"), "utf8");
    expect(source).toMatch(/export\s+function\s+runUrlConformance\b/);
    expect(source).not.toMatch(/vitest/);
    expect(source).not.toMatch(/node:/);
    const specifiers = [...source.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((match) => match[1]);
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) expect(specifier.startsWith(".")).toBe(true);
  });

  it("tests the host's URL implementation: a URL whose hostname is not normalized fails 0x7f.1", () => {
    class UnnormalizedUrl extends NodeURL {
      private readonly written: string;
      constructor(input: string | URL, base?: string | URL) {
        super(input, base);
        this.written = String(input);
      }
      override get hostname(): string {
        return this.written === "http://0x7f.1/" ? "0x7f.1" : super.hostname;
      }
    }
    vi.stubGlobal("URL", UnnormalizedUrl);
    const report = runUrlConformance();
    expect(report.failures.length).toBeGreaterThan(0);
    expect(report.failures.map((failure) => failure.vector)).toContain("http://0x7f.1/");
    expect(report.passed).toBeLessThan(report.total);
  });

  it("passes every vector when the URL returns Unicode hostnames instead of punycode", () => {
    class UnicodeHostUrl extends NodeURL {
      override get hostname(): string {
        return domainToUnicode(super.hostname);
      }
    }
    vi.stubGlobal("URL", UnicodeHostUrl);
    const report = runUrlConformance();
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(report.total);
  });

  it("passes every vector when the URL throws on any non-ASCII or xn-- input", () => {
    const refused = (value: unknown): boolean => value !== undefined && /[^\u0000-\u007f]|xn--/i.test(String(value));
    class ThrowingUrl extends NodeURL {
      constructor(input: string | URL, base?: string | URL) {
        if (refused(input) || refused(base)) throw new TypeError("Invalid URL");
        super(input, base);
      }
    }
    vi.stubGlobal("URL", ThrowingUrl);
    const report = runUrlConformance();
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(report.total);
  });
});
