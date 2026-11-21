import { describe, expect, it } from "vitest";
import { isSupportedServerVersion, parseServerVersion } from "./server-version";

describe("parseServerVersion", () => {
  it("parses three-part versions", () => {
    expect(parseServerVersion("10.11.7")).toEqual({ major: 10, minor: 11, patch: 7 });
    expect(parseServerVersion("12.4.0")).toEqual({ major: 12, minor: 4, patch: 0 });
  });

  it("treats two-part versions as patch 0", () => {
    expect(parseServerVersion("12.4")).toEqual({ major: 12, minor: 4, patch: 0 });
  });

  it("accepts a dash suffix after three numeric parts", () => {
    expect(parseServerVersion("12.4.0-beta.1")).toEqual({ major: 12, minor: 4, patch: 0 });
  });

  it.each(["", "abc", "10", "10.x.1", "v12.4.0", "12.4.0.1", "12.4-beta", "12.4.0-", "10.11.7 ", "-1.0.0"])(
    "rejects malformed version %j",
    (text) => {
      expect(parseServerVersion(text)).toBeUndefined();
    },
  );
});

describe("isSupportedServerVersion", () => {
  const supported = (text: string) => {
    const version = parseServerVersion(text);
    return version !== undefined && isSupportedServerVersion(version);
  };

  it("rejects versions older than 10.11.0", () => {
    expect(supported("10.10.7")).toBe(false);
    expect(supported("9.99.99")).toBe(false);
  });

  it("accepts 10.11.0 and newer, including 12.x and later", () => {
    expect(supported("10.11.0")).toBe(true);
    expect(supported("10.11.7")).toBe(true);
    expect(supported("10.12.0")).toBe(true);
    expect(supported("12.4.0")).toBe(true);
    expect(supported("13.0.0")).toBe(true);
  });
});
