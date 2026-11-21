import { describe, expect, it } from "vitest";
import { PRE_SIGN_IN_ROUTES, TransportError, type TransportErrorCode } from "./transport";

const CODES: TransportErrorCode[] = ["network", "timeout", "redirect", "cancelled", "refused", "unexpected-response", "status"];

describe("TransportError", () => {
  it.each(CODES)("keeps its code and gives fixed text for %s", (code) => {
    const error = new TransportError(code, code === "status" ? 503 : undefined);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.message).not.toMatch(/https?:|\/|Authorization|Token/i);
    expect(error.status).toBe(code === "status" ? 503 : undefined);
  });

  it("names a cancellation AbortError and every other failure TransportError", () => {
    expect(new TransportError("cancelled").name).toBe("AbortError");
    for (const code of CODES.filter((candidate) => candidate !== "cancelled")) expect(new TransportError(code).name).toBe("TransportError");
  });

  it("has no status unless one is given", () => {
    expect("status" in new TransportError("network")).toBe(false);
  });
});

describe("PRE_SIGN_IN_ROUTES", () => {
  it("lists the four tokenless routes", () => {
    expect([...PRE_SIGN_IN_ROUTES]).toEqual([
      "GET /System/Info/Public",
      "GET /QuickConnect/Enabled",
      "POST /QuickConnect/Initiate",
      "GET /QuickConnect/Connect",
    ]);
  });
});
