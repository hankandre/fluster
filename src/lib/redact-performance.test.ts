import { expect, it } from "vitest";
import { redactText } from "./redact";

it("redacts long unbroken input in linear time", () => {
  const inputs = ["a".repeat(200_000), `${"a".repeat(200_000)} token=secret`, "x-".repeat(100_000)];
  for (const input of inputs) {
    const started = performance.now();
    const output = redactText(input);
    expect(performance.now() - started).toBeLessThan(250);
    expect(output).not.toContain("secret");
  }
});
