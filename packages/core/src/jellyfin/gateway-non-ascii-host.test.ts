// @vitest-environment node
// T2-06 acceptance item 2, gateway side: a plain-HTTP address whose host is not plain ASCII is refused as
// public-http before the transport is called (decision 0001, I5).
import { describe, expect, it } from "vitest";
import { webCrypto } from "../adapters/web-crypto";
import { SignInFailure } from "../domain/sign-in-failure";
import type { SignInRequest, SignInResult, Transport, TransportRequest, TransportResponse } from "../ports/transport";
import { JellyfinGateway } from "./gateway";
import hostClasses from "../../tests/fixtures/host-classes.json";

class SpyTransport implements Transport {
  calls = 0;
  async signIn(_request: SignInRequest): Promise<SignInResult> {
    this.calls += 1;
    return { session: "session-1", userId: "user-1", userName: "Louise" };
  }
  async request(_request: TransportRequest): Promise<TransportResponse> {
    this.calls += 1;
    return { status: 200, body: {} };
  }
  async endSession(_session: string): Promise<void> {
    this.calls += 1;
  }
}

const NEW_HTTP_VECTORS = [
  "http://ｎａｓ.local/",
  "http://nas。local/",
  "http://nas.loc­al/",
  "http://naſ.local/",
  "http://Kodi.local/",
  "http://ｌocalhost/",
  "http://１２７.0.0.1/",
  "http://nas.bücher.local/",
  "http://bücher.home.arpa/",
  "http://XN--BCHER-KVA.local/",
  "http://%6eas.local/",
  "http://1%30.0.0.1/",
  "http://%6c%6f%63%61%6c%68%6f%73%74/",
  "http://na\ts.local/",
  "http:\\\\nas.local/",
  "http:/nas.local/",
  "http:nas.local",
];

describe("a plain-HTTP address with a non-ASCII or encoded host", () => {
  it.each(NEW_HTTP_VECTORS.map((url) => [url] as const))("%j is a public vector in the shared file", (url) => {
    const vector = (hostClasses.vectors as { url: string; class: string }[]).find((entry) => entry.url === url);
    expect(vector?.class).toBe("public");
  });

  it.each(NEW_HTTP_VECTORS.map((url) => [url] as const))("is refused as public-http when %j is given to the constructor, before any transport call", (url) => {
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
});
