import { describe, expect, it } from "vitest";
import { redactText } from "./redact";
import { safeReason } from "./safe-reason";

it("redacts long unbroken input in linear time", () => {
  const inputs = ["a".repeat(200_000), `${"a".repeat(200_000)} token=secret`, "x-".repeat(100_000)];
  for (const input of inputs) {
    const started = performance.now();
    const output = redactText(input);
    expect(performance.now() - started).toBeLessThan(250);
    expect(output).not.toContain("secret");
  }
});

// Acceptance 6 (P0-19). A vitest timeout cannot interrupt a synchronous
// replace, so each input first runs at a small size against a scaled bound: a
// quadratic pattern fails there in under a second instead of running for minutes.
const ONE_MEGABYTE_BOUND_MS = 1000;
const SIZE = 1 << 20;
const GUARD_SIZE = 1 << 16;
const GUARD_BOUND_MS = 60;

function adversarial(size: number): string[] {
  return [
    "a".repeat(size),
    "x-".repeat(size / 2),
    "a.".repeat(size / 2),
    "/a".repeat(size / 2),
    "a:".repeat(size / 2),
    "token ".repeat(size / 6),
    `token ${"a".repeat(size)}`,
    " 1.1.1.1".repeat(size / 8),
    `http://${"[".repeat(size)}`,
    'a://["'.repeat(size / 6),
    "a://[)".repeat(size / 6),
    "\\".repeat(size),
  ];
}

function timeOf(filter: (value: string) => string, input: string): number {
  const started = performance.now();
  filter(input);
  return performance.now() - started;
}

describe.each([
  ["redactText", redactText],
  ["safeReason", safeReason],
])("%s on long input", (_name, filter) => {
  it("stays linear on a small guard size", () => {
    for (const input of adversarial(GUARD_SIZE)) {
      expect(timeOf(filter, input), input.slice(0, 12)).toBeLessThan(GUARD_BOUND_MS);
    }
  });

  it("finishes 1 MB inputs within the bound", () => {
    for (const input of adversarial(SIZE)) {
      expect(timeOf(filter, input), input.slice(0, 12)).toBeLessThan(ONE_MEGABYTE_BOUND_MS);
    }
  });
});

it("redacts a credential at the end of a 1 MB input", () => {
  expect(redactText(`${"a".repeat(SIZE)} token=secret`)).not.toContain("secret");
});
