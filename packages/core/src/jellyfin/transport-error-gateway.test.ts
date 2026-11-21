import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../domain/catalog";
import { classifyTransportError } from "../transport-error";
import { JellyfinGateway } from "./gateway";
import { TransportError, type SignInRequest, type SignInResult, type Transport, type TransportRequest, type TransportResponse } from "../ports/transport";
import { webCrypto } from "../adapters/web-crypto";

// A PlaybackInfo request that fails the way a transport reports it.
function failingTransport(failure: Error | { status: number }): Transport {
  return {
    async signIn(_request: SignInRequest): Promise<SignInResult> {
      return { session: "session-1", userId: "user-test", userName: "tester" };
    },
    async request(_request: TransportRequest): Promise<TransportResponse> {
      if ("status" in failure && !(failure instanceof Error)) return { status: failure.status, body: undefined };
      throw failure;
    },
    async endSession(): Promise<void> {},
  };
}

const item: LibraryItem = { id: "m1", name: "Fixture", type: "Movie", resumePositionTicks: 0, played: false };

async function kindOfFailure(failure: Error | { status: number }) {
  const gateway = new JellyfinGateway("http://127.0.0.1:8096", webCrypto, failingTransport(failure), "install-1");
  await gateway.login("tester", "password");
  const error = await gateway.createPlaybackPlan(item, 0).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(Error);
  return classifyTransportError(error);
}

describe("a failed PlaybackInfo request", () => {
  it("is classified by status or code, not by message", async () => {
    expect(await kindOfFailure({ status: 500 })).toBe("server");
    expect(await kindOfFailure(new TransportError("network"))).toBe("network");
    expect(await kindOfFailure(new TransportError("timeout"))).toBe("network");
    expect(await kindOfFailure({ status: 400 })).toBe("request");
  });

  it("gives a rejected status the same kind as a resolved one", async () => {
    expect(await kindOfFailure(new TransportError("status", 503))).toBe("server");
    expect(await kindOfFailure(new TransportError("status", 404))).toBe("request");
  });
});
