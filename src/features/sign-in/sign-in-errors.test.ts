import { describe, expect, it } from "vitest";
import { SignInFailure } from "../../domain/sign-in-failure";
import { PUBLIC_HTTP_REFUSED_MESSAGE } from "../../lib/jellyfin/gateway";
import { redactTransportError } from "../../lib/transport-error";
import { GENERIC_COPY, signInErrorCopy, unreachableCopy, WRONG_PASSWORD_COPY } from "./sign-in-errors";

const ADDRESS = "https://media.test";
const TRANSPORT_TEXT = /status code|Network Error|ECONN|ETIMEDOUT|AxiosError|timeout of/;

function axiosError(message: string, fields: Record<string, unknown>): Error {
  return Object.assign(new Error(message), { isAxiosError: true, ...fields });
}

describe("signInErrorCopy", () => {
  it("shows a SignInFailure's own sentence", () => {
    expect(signInErrorCopy(new SignInFailure("public-http", PUBLIC_HTTP_REFUSED_MESSAGE))).toBe(PUBLIC_HTTP_REFUSED_MESSAGE);
    expect(signInErrorCopy(new SignInFailure("unsupported-version", "Fluster needs Jellyfin 10.11 or newer; this server reports 10.9.0."))).toContain("10.11");
  });

  it("maps a 401 to the wrong-password row on the password step only", () => {
    const error = axiosError("Request failed with status code 401", { response: { status: 401 } });
    expect(signInErrorCopy(error, { address: ADDRESS, afterCredentials: true })).toBe(WRONG_PASSWORD_COPY);
    expect(signInErrorCopy(error, { address: ADDRESS })).toBe(GENERIC_COPY);
  });

  it.each(["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND"])(
    "maps %s to the unreachable row with the address",
    (code) => {
      const copy = signInErrorCopy(axiosError("Network Error", { code }), { address: ADDRESS });
      expect(copy).toBe(unreachableCopy(ADDRESS));
      expect(copy).toBe("Couldn't reach https://media.test. Check the address and that the server is running.");
    },
  );

  it("maps a TimeoutError to the unreachable row", () => {
    const error = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    expect(signInErrorCopy(error, { address: ADDRESS })).toBe(unreachableCopy(ADDRESS));
  });

  it("keeps the kind through redaction that replaces a read-only error", () => {
    const error = axiosError("Network Error for https://media.test/QuickConnect/Connect?secret=abc", { code: "ERR_NETWORK" });
    Object.defineProperty(error, "message", { value: error.message, writable: false, configurable: false });
    const redacted = redactTransportError(error);
    expect(signInErrorCopy(redacted, { address: ADDRESS })).toBe(unreachableCopy(ADDRESS));
  });

  it("gives the generic sentence for everything else", () => {
    const server = axiosError("Request failed with status code 500", { response: { status: 500 } });
    for (const error of [server, new Error("Request failed with status code 500"), "boom", undefined, null]) {
      expect(signInErrorCopy(error, { address: ADDRESS, afterCredentials: true })).toBe(GENERIC_COPY);
    }
  });

  it("gives the generic sentence for a network error without an address", () => {
    expect(signInErrorCopy(axiosError("Network Error", { code: "ERR_NETWORK" }))).toBe(GENERIC_COPY);
  });

  it("never lets transport text through", () => {
    const errors = [
      axiosError("Request failed with status code 401", { response: { status: 401 } }),
      axiosError("Network Error", { code: "ERR_NETWORK" }),
      axiosError("timeout of 10000ms exceeded", { code: "ECONNABORTED" }),
      axiosError("connect ETIMEDOUT 10.0.0.2:8096", { code: "ETIMEDOUT" }),
      axiosError("Request failed with status code 500", { response: { status: 500 } }),
      new Error("Request failed with status code 500"),
      "AxiosError",
    ];
    for (const error of errors) {
      for (const afterCredentials of [true, false]) {
        expect(signInErrorCopy(error, { address: ADDRESS, afterCredentials })).not.toMatch(TRANSPORT_TEXT);
      }
    }
  });
});
