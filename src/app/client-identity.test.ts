import { describe, expect, it } from "vitest";
import { deviceNameFor } from "./client-identity";

describe("deviceNameFor", () => {
  it.each([
    ["WebKitGTK", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", "Fluster Linux"],
    ["WKWebView", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)", "Fluster macOS"],
    ["Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Fluster Windows"],
    ["curl", "curl/8", "Fluster"],
    ["Android", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36", "Fluster"],
  ])("names %s", (_label, userAgent, name) => {
    expect(deviceNameFor(userAgent)).toBe(name);
  });

  it("never copies user-agent text into the name", () => {
    expect(deviceNameFor("Mozilla/5.0 (X11; Linux x86_64) my-host louise")).toBe("Fluster Linux");
  });
});
