import { describe, expect, it } from "vitest";
import { classifyTransportError, redactTransportError } from "./transport-error";

function axiosError(fields: Record<string, unknown>, message = "failed"): Error {
  return Object.assign(new Error(message), { isAxiosError: true }, fields);
}

describe("classifyTransportError", () => {
  it("calls an HTTP 5xx a server error and other statuses a request error", () => {
    expect(classifyTransportError(axiosError({ response: { status: 500 } }))).toBe("server");
    expect(classifyTransportError(axiosError({ response: { status: 503 } }))).toBe("server");
    expect(classifyTransportError(axiosError({ response: { status: 404 } }))).toBe("request");
    expect(classifyTransportError(axiosError({ response: { status: 401 } }))).toBe("request");
  });

  it("calls a missing response, a network code, or a timeout a network failure", () => {
    expect(classifyTransportError(axiosError({ code: "ERR_NETWORK" }, "Network Error"))).toBe("network");
    expect(classifyTransportError(axiosError({ code: "ECONNABORTED" }, "timeout of 30000ms exceeded"))).toBe("network");
    expect(classifyTransportError(axiosError({}))).toBe("network");
    expect(classifyTransportError(Object.assign(new Error("x"), { code: "ETIMEDOUT" }))).toBe("network");
    expect(classifyTransportError(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe("network");
  });

  it("does not classify cancellations, plain errors, or non-errors", () => {
    expect(classifyTransportError(Object.assign(new Error("x"), { name: "AbortError" }))).toBeUndefined();
    expect(classifyTransportError(axiosError({ code: "ERR_CANCELED" }))).toBeUndefined();
    expect(classifyTransportError(new Error("Decoder failed"))).toBeUndefined();
    expect(classifyTransportError("Network Error")).toBeUndefined();
    expect(classifyTransportError(undefined)).toBeUndefined();
  });

  it("keeps the kind on the redacted error even when redaction replaces it", () => {
    const original = axiosError({ response: { status: 502 } }, "GET http://hearth.lan/Items?api_key=secret failed");
    Object.defineProperty(original, "message", { value: original.message, writable: false });
    const redacted = redactTransportError(original);
    expect(redacted).not.toBe(original);
    expect(classifyTransportError(redacted)).toBe("server");
    expect((redacted as Error).message).not.toContain("secret");
  });
});
