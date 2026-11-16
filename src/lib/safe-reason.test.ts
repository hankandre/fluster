import { describe, expect, it } from "vitest";
import { errorReason, safeReason } from "./safe-reason";

describe("safeReason forms", () => {
  it.each([
    ["connect to 192.168.1.10:8096 failed", "connect to [address] failed"],
    ["connect to media.local:8096 failed", "connect to [address] failed"],
    ["connect to nas:8096 failed", "connect to [address] failed"],
    ["connect to localhost:80 failed", "connect to [address] failed"],
    ["connect to [::1]:8096 failed", "connect to [address] failed"],
    ["cannot open /tmp", "cannot open [path]"],
    ["cannot open /video.mkv now", "cannot open [path] now"],
    ["cannot open C:/Users/u/x.dll now", "cannot open [path] now"],
    ["cannot open \\\\nas\\share\\x.mkv now", "cannot open [path] now"],
    ["cannot open //nas/share/x.mkv now", "cannot open [path] now"],
    ["GET http://[fe80::1]:8096/web/index.html failed", "GET [address] failed"],
    ["GET http://user@[::1]:8096/web/x failed", "GET [address] failed"],
  ])("rewrites %s", (input, expected) => {
    expect(safeReason(input)).toBe(expected);
    expect(safeReason(safeReason(input))).toBe(expected);
  });

  it.each([
    "at 12:30 the ratio was 16:9, time 01:02:03",
    "status:500 code:404 line:12 Stream #0:1 v0.41.0:5",
    "libmpv 0.30 is too old; need 0.35 (OpenGL/EGL)",
    "and/or n/a 1/2 either / or",
    "The token expired",
    "24 fps at 1920x1080, 16:9",
  ])("leaves %s as it is", (input) => {
    expect(safeReason(input)).toBe(input);
  });

  it("leaves no secret or stray bracket beside an IPv6 URL with a credential query", () => {
    const output = safeReason("https://[::1]:8096/x?api_key=SECRET");
    expect(output).not.toContain("SECRET");
    expect(output).toBe("[address]");
  });
});

describe("errorReason", () => {
  it("hides the path and host of an error", () => {
    const text = errorReason(new Error("cannot open C:/Users/u/x.dll on nas:8096"), "fallback");
    expect(text).not.toContain("Users");
    expect(text).not.toContain("nas");
  });
});
