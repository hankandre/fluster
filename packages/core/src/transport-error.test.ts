import { describe, expect, it } from "vitest";
import { TransportError } from "./ports/transport";
import { classifyTransportError, redactTransportError } from "./transport-error";

describe("classifyTransportError", () => {
  it("calls an HTTP 5xx a server error and other statuses a request error", () => {
    expect(classifyTransportError(new TransportError("status", 500))).toBe("server");
    expect(classifyTransportError(new TransportError("status", 503))).toBe("server");
    expect(classifyTransportError(new TransportError("status", 404))).toBe("request");
    expect(classifyTransportError(new TransportError("status", 401))).toBe("request");
  });

  it("calls a network failure or a timeout a network failure", () => {
    expect(classifyTransportError(new TransportError("network"))).toBe("network");
    expect(classifyTransportError(new TransportError("timeout"))).toBe("network");
  });

  it("calls a refused request and an unusable answer a request error", () => {
    expect(classifyTransportError(new TransportError("refused"))).toBe("request");
    expect(classifyTransportError(new TransportError("unexpected-response"))).toBe("request");
  });

  it("does not classify cancellations, redirects, plain errors, or non-errors", () => {
    expect(classifyTransportError(new TransportError("cancelled"))).toBeUndefined();
    expect(classifyTransportError(new TransportError("redirect"))).toBeUndefined();
    expect(classifyTransportError(Object.assign(new Error("x"), { name: "AbortError" }))).toBeUndefined();
    expect(classifyTransportError(new Error("Decoder failed"))).toBeUndefined();
    expect(classifyTransportError("Network Error")).toBeUndefined();
    expect(classifyTransportError(undefined)).toBeUndefined();
  });

  it("reads the code and status, never the message", () => {
    expect(classifyTransportError(Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" }))).toBeUndefined();
    expect(classifyTransportError(Object.assign(new Error("status 500"), { response: { status: 500 } }))).toBeUndefined();
  });

  it("keeps the kind on the redacted error even when redaction replaces it", () => {
    const original = Object.assign(new Error("GET http://hearth.lan/Items?api_key=secret failed"), { code: "status", status: 502 });
    Object.defineProperty(original, "message", { value: original.message, writable: false });
    const redacted = redactTransportError(original);
    expect(redacted).not.toBe(original);
    expect(classifyTransportError(redacted)).toBe("server");
    expect((redacted as Error).message).not.toContain("secret");
  });
});

describe("redactTransportError", () => {
  it("rebuilds an error that carries config, request, response or cause, keeping its name, code and status", () => {
    const leaky = Object.assign(new TransportError("status", 500), {
      config: { headers: { Authorization: "x" } },
      request: {},
      response: { status: 500 },
      cause: new Error("x"),
    });
    const redacted = redactTransportError(leaky) as Error & { code?: string; status?: number };
    for (const field of ["config", "request", "response", "cause"]) expect(field in redacted).toBe(false);
    expect(redacted).toMatchObject({ name: "TransportError", code: "status", status: 500 });
    expect(classifyTransportError(redacted)).toBe("server");
  });

  it("keeps a cancellation's AbortError name through the rebuild", () => {
    const leaky = Object.assign(new TransportError("cancelled"), { request: {} });
    expect((redactTransportError(leaky) as Error).name).toBe("AbortError");
  });

  it("returns a clean transport error as it is", () => {
    const clean = new TransportError("network");
    expect(redactTransportError(clean)).toBe(clean);
  });
});
