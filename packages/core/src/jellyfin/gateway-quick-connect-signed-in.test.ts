// @vitest-environment node
// Quick Connect while signed in (switching or adding a user): initiate and poll stay tokenless and carry the
// Quick Connect DeviceId, the same one the sign-in uses.
import { describe, expect, it } from "vitest";
import { TransportError, type SignInRequest, type SignInResult, type Transport, type TransportRequest, type TransportResponse } from "../ports/transport";
import { webCrypto } from "../adapters/web-crypto";
import { JellyfinGateway } from "./gateway";

class FakeTransport implements Transport {
  readonly requests: TransportRequest[] = [];
  readonly signIns: SignInRequest[] = [];

  async signIn(request: SignInRequest): Promise<SignInResult> {
    this.signIns.push(request);
    return { session: "session-1", userId: "user-1", userName: "Louise", serverId: "server-1" };
  }

  async request(request: TransportRequest): Promise<TransportResponse> {
    this.requests.push(request);
    switch (`${request.method} ${request.path}`) {
      case "POST /QuickConnect/Initiate":
        return { status: 200, body: { Secret: "qc-secret", Code: "123456" } };
      case "GET /QuickConnect/Connect":
        return { status: 200, body: { Authenticated: true } };
      default:
        throw new TransportError("refused");
    }
  }

  async endSession(): Promise<void> {}
}

describe("Quick Connect while signed in", () => {
  it("sends initiate and poll tokenless with the sign-in DeviceId", async () => {
    const transport = new FakeTransport();
    const gateway = new JellyfinGateway("https://jf.example", webCrypto, transport, "install-1");
    await gateway.login("louise", "pw");
    expect(gateway.currentUserName()).toBe("Louise");

    await gateway.initiateQuickConnect();
    await gateway.pollQuickConnect("qc-secret");
    await gateway.authenticateWithQuickConnect("qc-secret");

    const [initiate, poll] = transport.requests;
    for (const request of [initiate, poll]) {
      expect("session" in request.target).toBe(false);
      expect(request.target).toMatchObject({ server: "https://jf.example", deviceId: transport.signIns[1].deviceId });
    }
    expect(transport.signIns[1].deviceId).not.toBe(transport.signIns[0].deviceId);
  });
});
