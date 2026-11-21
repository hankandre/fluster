// T2-03 acceptance item 3: the gateway takes hashing and random ids from an injected Crypto port.
import { describe, expect, it, vi } from "vitest";
import { webCrypto } from "../adapters/web-crypto";
import type { Crypto } from "../ports/crypto";
import { JellyfinGateway } from "./gateway";
import type { HttpRequestConfig, HttpResponse, HttpTransport } from "./types";

class FakeTransport implements HttpTransport {
  requests: { method: string; url: string; headers?: Record<string, string> }[] = [];
  responses = new Map<string, unknown>();

  async get<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.requests.push({ method: "GET", url, headers: config?.headers });
    return { data: this.responses.get(`GET ${url}`) as T };
  }

  async post<T>(url: string, _data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.requests.push({ method: "POST", url, headers: config?.headers });
    return { data: this.responses.get(`POST ${url}`) as T };
  }

  async delete<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.requests.push({ method: "DELETE", url, headers: config?.headers });
    return { data: this.responses.get(`DELETE ${url}`) as T };
  }
}

function fakeCrypto(): Crypto & { sha256Hex: ReturnType<typeof vi.fn>; randomId: ReturnType<typeof vi.fn> } {
  return { sha256Hex: vi.fn(async () => "fake-digest"), randomId: vi.fn(() => "random-install") };
}

async function login(crypto: Crypto, installId: string | undefined, username = "Louise") {
  const transport = new FakeTransport();
  transport.responses.set("GET /System/Info/Public", { Version: "10.11.0", Id: "server-1" });
  transport.responses.set("POST /Users/AuthenticateByName", { AccessToken: "top-secret", User: { Id: "user-1", Name: username } });
  const gateway = new JellyfinGateway("https://media.test", crypto, transport, installId);
  await gateway.connect();
  await gateway.login(username, "password");
  const request = transport.requests.find((entry) => entry.url === "/Users/AuthenticateByName")!;
  return /DeviceId="([^"]+)"/.exec(request.headers?.Authorization ?? "")?.[1];
}

describe("JellyfinGateway with an injected Crypto", () => {
  it("sends the DeviceId the port derives on login", async () => {
    const crypto = fakeCrypto();
    expect(await login(crypto, "install-1")).toBe("fake-digest");
    expect(crypto.sha256Hex).toHaveBeenCalledWith("install-1:server-1:louise");
    expect(crypto.randomId).not.toHaveBeenCalled();
  });

  it("asks the port for a random install id when none is given", async () => {
    const crypto = fakeCrypto();
    await login(crypto, undefined);
    expect(crypto.randomId).toHaveBeenCalledTimes(1);
    expect(crypto.sha256Hex).toHaveBeenCalledTimes(1);
    expect(crypto.sha256Hex.mock.calls[0]![0]).toMatch(/^random-install:/);
  });

  it("derives the same DeviceId as before with the WebCrypto adapter", async () => {
    expect(await login(webCrypto, "install-1")).toBe("07bce1a97d44b7008418adc02ad74694142287bef4bd4007377574dc451aaf78");
  });
});
