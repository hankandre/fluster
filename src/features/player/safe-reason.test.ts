import { describe, expect, it } from "vitest";
import { errorReason, safeReason } from "./safe-reason";

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

describe("errorReason", () => {
  it("reads a string and an Error with the same text the same way, without leaks", () => {
    const fromString = errorReason(NASTY_REASON, "fallback");
    expect(errorReason(new Error(NASTY_REASON), "fallback")).toBe(fromString);
    expect(fromString).toBe(safeReason(NASTY_REASON));
    expect(fromString).not.toContain("SECRET-TOKEN");
  });

  it("gives the fallback when the failure has no text", () => {
    for (const value of ["", "   ", new Error(""), undefined, { code: 1 }]) {
      expect(errorReason(value, "fallback")).toBe("fallback");
    }
  });
});

describe("safeReason applied twice", () => {
  // Not idempotent in general: a credential pair closed by ")" loses the ")"
  // on the second pass. It holds for these inputs, and neither pass leaks.
  it("is stable for addresses, paths, and the length cap", () => {
    expect(safeReason(safeReason(NASTY_REASON))).toBe(safeReason(NASTY_REASON));
    const long = "a ".repeat(400);
    expect(safeReason(safeReason(long))).toBe(safeReason(long));
  });
});
