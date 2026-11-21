// @vitest-environment node
// T2-04 acceptance item 4: a public plain-HTTP address is refused before the transport is called, and sign-in
// calls are refused until the private-LAN confirmation exists (decision 0001). The rules are unchanged; they
// now stand in front of the Transport port.
import { describe, expect, it } from "vitest";
import { SignInFailure } from "../domain/sign-in-failure";
import { MemoryLanHttpConfirmations } from "../lan-http-confirmations";
import { TransportError, type SignInRequest, type SignInResult, type Transport, type TransportRequest, type TransportResponse } from "../ports/transport";
import { webCrypto } from "../adapters/web-crypto";
import { deriveDeviceId } from "./device-id";
import { JellyfinGateway } from "./gateway";
import hostClasses from "../../tests/fixtures/host-classes.json";

class SpyTransport implements Transport {
  readonly requests: TransportRequest[] = [];
  readonly signIns: SignInRequest[] = [];
  readonly ended: string[] = [];

  constructor(private readonly serverId: string = "server-1") {}

  async signIn(request: SignInRequest): Promise<SignInResult> {
    this.signIns.push(request);
    return { session: "session-1", userId: "user-1", userName: "Louise" };
  }

  async request(request: TransportRequest): Promise<TransportResponse> {
    this.requests.push(request);
    if (request.path === "/System/Info/Public") {
      return { status: 200, body: { ServerName: "Home", Version: "10.11.7", Id: this.serverId } };
    }
    if (request.path === "/QuickConnect/Initiate") return { status: 200, body: { Secret: "qc-secret", Code: "123456" } };
    if (request.path === "/QuickConnect/Connect") return { status: 200, body: { Authenticated: true } };
    return { status: 200, body: {} };
  }

  async endSession(session: string): Promise<void> {
    this.ended.push(session);
  }

  get calls(): number {
    return this.requests.length + this.signIns.length + this.ended.length;
  }
}

const publicHttp = (hostClasses.vectors as { url: string; class: string }[]).filter((vector) => vector.class === "public" && vector.url.startsWith("http:"));
const PRIVATE_LAN = "http://192.168.1.5:8096";

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

async function expectNotConfirmed(promise: Promise<unknown>): Promise<void> {
  const error = await failureOf(promise);
  expect(error).toBeInstanceOf(SignInFailure);
  expect((error as SignInFailure).kind).toBe("not-confirmed");
}

describe("a public plain-HTTP address", () => {
  it("has vectors in the shared host-class fixture", () => {
    expect(publicHttp.length).toBeGreaterThan(10);
  });

  it.each(publicHttp.map((vector) => [vector.url] as const))("is refused when %s is given to the constructor, before any transport call", (url) => {
    const transport = new SpyTransport();
    let thrown: unknown;
    try {
      new JellyfinGateway(url, webCrypto, transport, "install-1");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SignInFailure);
    expect((thrown as SignInFailure).kind).toBe("public-http");
    expect(transport.calls).toBe(0);
  });

  it("is allowed over HTTPS (positive control)", async () => {
    const transport = new SpyTransport();
    const gateway = new JellyfinGateway("https://media.example", webCrypto, transport, "install-1");
    await gateway.login("Louise", "hunter2");
    expect(transport.signIns).toHaveLength(1);
  });
});

describe("a private-LAN HTTP server that is not confirmed", () => {
  it("shows the confirmation and refuses every sign-in call; the transport sees only the probe", async () => {
    const transport = new SpyTransport();
    const gateway = new JellyfinGateway(PRIVATE_LAN, webCrypto, transport, "install-1");
    const connection = await gateway.connect();
    expect(connection.needsUnencryptedConfirmation).toBe(true);

    await expectNotConfirmed(gateway.login("Louise", "hunter2"));
    await expectNotConfirmed(gateway.initiateQuickConnect());
    await expectNotConfirmed(gateway.pollQuickConnect("qc-secret"));
    await expectNotConfirmed(gateway.authenticateWithQuickConnect("qc-secret"));

    expect(transport.signIns).toEqual([]);
    expect(transport.requests.map((request) => `${request.method} ${request.path}`)).toEqual(["GET /System/Info/Public"]);
  });

  it("is refused again for a different server Id at a confirmed origin", async () => {
    const store = new MemoryLanHttpConfirmations();
    const first = new JellyfinGateway(PRIVATE_LAN, webCrypto, new SpyTransport("server-1"), "install-1", store);
    await first.connect();
    first.confirmUnencryptedConnection();

    const transport = new SpyTransport("server-2");
    const second = new JellyfinGateway(PRIVATE_LAN, webCrypto, transport, "install-1", store);
    expect((await second.connect()).needsUnencryptedConfirmation).toBe(true);
    await expectNotConfirmed(second.login("Louise", "hunter2"));
    expect(transport.signIns).toEqual([]);
  });
});

describe("after the private-LAN confirmation", () => {
  async function confirmed() {
    const transport = new SpyTransport();
    const gateway = new JellyfinGateway(PRIVATE_LAN, webCrypto, transport, "install-1");
    await gateway.connect();
    gateway.confirmUnencryptedConnection();
    return { gateway, transport };
  }

  it("sends the password through transport.signIn exactly once with the server, the DeviceId and the credential", async () => {
    const { gateway, transport } = await confirmed();
    await expect(gateway.login("Louise", "hunter2")).resolves.toEqual({ userId: "user-1", username: "Louise" });

    expect(transport.signIns).toHaveLength(1);
    expect(transport.signIns[0]).toMatchObject({
      server: PRIVATE_LAN,
      deviceId: await deriveDeviceId(webCrypto, "install-1", "server-1", "Louise"),
      credential: { kind: "password", username: "Louise", password: "hunter2" },
    });
    expect(transport.signIns[0].timeoutMs).toBeGreaterThan(0);
  });

  it("sends the Quick Connect calls with the placeholder-user DeviceId", async () => {
    const { gateway, transport } = await confirmed();
    const deviceId = await deriveDeviceId(webCrypto, "install-1", "server-1", "#quick-connect");

    await gateway.initiateQuickConnect();
    await gateway.pollQuickConnect("qc-secret");
    await gateway.authenticateWithQuickConnect("qc-secret");

    const [, initiate, poll] = transport.requests;
    expect(initiate).toMatchObject({ method: "POST", path: "/QuickConnect/Initiate", target: { server: PRIVATE_LAN, deviceId } });
    expect(poll).toMatchObject({ method: "GET", path: "/QuickConnect/Connect", query: [["secret", "qc-secret"]], target: { server: PRIVATE_LAN, deviceId } });
    expect(transport.signIns).toHaveLength(1);
    expect(transport.signIns[0]).toMatchObject({
      server: PRIVATE_LAN,
      deviceId,
      credential: { kind: "quick-connect", secret: "qc-secret" },
    });
  });

  it("needs no confirmation on loopback HTTP or on HTTPS", async () => {
    for (const url of ["http://127.0.0.1:8096", "http://localhost:8096", "https://media.example"]) {
      const transport = new SpyTransport();
      const gateway = new JellyfinGateway(url, webCrypto, transport, "install-1");
      await gateway.login("Louise", "hunter2");
      expect(transport.signIns, url).toHaveLength(1);
    }
  });

  it("does not use the transport for a sign-in that signIn rejected, and keeps the failure plain", async () => {
    const transport = new SpyTransport();
    transport.signIn = async () => {
      throw new TransportError("status", 401);
    };
    const gateway = new JellyfinGateway("https://media.example", webCrypto, transport, "install-1");
    await expect(gateway.login("Louise", "wrong")).rejects.toBeDefined();
    expect(() => gateway.sessionId()).toThrow(/Sign in/);
  });
});
