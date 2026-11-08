import { describe, expect, it } from "vitest";
import { safeReason } from "./safe-reason";

const NASTY_REASON =
  "GL failed: /usr/lib/x86_64-linux-gnu/libEGL.so.1 file:///home/u/x ftp://h/x C:\\Users\\u\\x.dll ~/.config/mpv api_key=SECRET-TOKEN";

describe("safeReason", () => {
  it("hides addresses, paths, and credentials", () => {
    const text = safeReason(NASTY_REASON);
    for (const leak of ["/usr/lib", "libEGL", "file://", "/home/u", "ftp://", "h/x", "Users", "x.dll", ".config", "SECRET-TOKEN"]) {
      expect(text).not.toContain(leak);
    }
    expect(text).toContain("GL failed");
  });

  it("keeps ordinary words and single slashes", () => {
    expect(safeReason("libmpv 0.30 is too old; need 0.35 (OpenGL/EGL)")).toBe("libmpv 0.30 is too old; need 0.35 (OpenGL/EGL)");
  });

  it("caps the length", () => {
    expect(safeReason("a ".repeat(400)).length).toBeLessThanOrEqual(301);
  });
});
