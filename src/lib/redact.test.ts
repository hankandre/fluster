import { describe, expect, it } from "vitest";
import { redactText, redactUrl } from "./redact";

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
});
