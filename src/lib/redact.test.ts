import { describe, expect, it } from "vitest";
import { redactText, redactUrl, redactedErrorMessage } from "./redact";

describe("credential redaction", () => {
  it("redacts credentials and all query values", () => {
    const result = redactUrl("https://user:pass@media.test/video?api_key=secret&PlaySessionId=session");
    expect(result).not.toContain("pass");
    expect(result).not.toContain("secret");
    expect(result).not.toContain("session");
  });

  it("redacts Jellyfin authorization headers", () => {
    const result = redactText('Authorization: MediaBrowser Client="Fluster", Token=secret');
    expect(result).not.toContain("Token=secret");
    expect(result).toContain("[redacted]");
  });

  it("redacts Quick Connect secrets in URLs and bare query strings", () => {
    const canary = "qc-secret-canary";
    expect(redactUrl(`https://media.test/QuickConnect/Connect?secret=${canary}`)).not.toContain(canary);
    expect(redactText(`GET /QuickConnect/Connect?secret=${canary} failed`)).not.toContain(canary);
    expect(redactText(`{"Secret":"${canary}"}`)).not.toContain(canary);
  });
});

describe("redactedErrorMessage", () => {
  const failure = "could not open https://media.test/x?api_key=SECRET-TOKEN";

  it("reads and redacts a string, an Error, and a DOMException alike", () => {
    const fromString = redactedErrorMessage(failure);
    expect(fromString).not.toContain("SECRET-TOKEN");
    expect(fromString).toContain("could not open");
    expect(redactedErrorMessage(new Error(failure))).toBe(fromString);
    expect(redactedErrorMessage(new DOMException(failure, "AbortError"))).toBe(fromString);
  });

  it("gives an empty string for values without a message", () => {
    for (const value of [undefined, null, 1, {}, { message: 2 }]) {
      expect(redactedErrorMessage(value)).toBe("");
    }
  });
});
