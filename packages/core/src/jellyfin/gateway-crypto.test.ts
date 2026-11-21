// T2-03 acceptance item 3: the gateway takes hashing and random ids from an injected Crypto port.
import { describe, expect, it, vi } from "vitest";
import { webCrypto } from "../adapters/web-crypto";
import type { Crypto } from "../ports/crypto";
import type { SignInRequest, SignInResult, Transport, TransportRequest, TransportResponse } from "../ports/transport";
import { JellyfinGateway } from "./gateway";

// The decision 0005 Transport port (T2-04): sign-in is its own call, and it carries the DeviceId the gateway derived.
class FakeTransport implements Transport {
  signIns: SignInRequest[] = [];

  constructor(private readonly userName: string) {}

  async signIn(request: SignInRequest): Promise<SignInResult> {
    this.signIns.push(request);
    return { session: "session-1", userId: "user-1", userName: this.userName };
  }

  async request(request: TransportRequest): Promise<TransportResponse> {
    if (request.method === "GET" && request.path === "/System/Info/Public") {
      return { status: 200, body: { Version: "10.11.0", Id: "server-1" } };
    }
    return { status: 404, body: undefined };
  }

  async endSession(): Promise<void> {}
}

function fakeCrypto(): Crypto & { sha256Hex: ReturnType<typeof vi.fn>; randomId: ReturnType<typeof vi.fn> } {
  return { sha256Hex: vi.fn(async () => "fake-digest"), randomId: vi.fn(() => "random-install") };
}

async function login(crypto: Crypto, installId: string | undefined, username = "Louise") {
  const transport = new FakeTransport(username);
  const gateway = new JellyfinGateway("https://media.test", crypto, transport, installId);
  await gateway.connect();
  await gateway.login(username, "password");
  return transport.signIns[0]?.deviceId;
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
