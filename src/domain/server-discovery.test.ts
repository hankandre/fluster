import { describe, expect, it } from "vitest";
import { sameServerId } from "./server-discovery";

describe("sameServerId", () => {
  it("matches ids that differ only in case or dashes", () => {
    expect(sameServerId("4c2b8f1e0d3a4b6c9e7f1a2b3c4d5e6f", "4C2B8F1E-0D3A-4B6C-9E7F-1A2B3C4D5E6F")).toBe(true);
  });

  it("refuses a different or missing probed id", () => {
    expect(sameServerId("server-1", "server-2")).toBe(false);
    expect(sameServerId("server-1", undefined)).toBe(false);
    expect(sameServerId("server-1", "")).toBe(false);
  });
});
