// @vitest-environment node
// Uses the real Axios client against local HTTP servers, so it proves that no
// gateway request follows a redirect (docs/decisions/0001, edge case 8).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JellyfinGateway, REDIRECT_REFUSED_MESSAGE } from "./gateway";

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

const servers: Server[] = [];

async function listen(handler: Handler): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

function json(response: ServerResponse, body: unknown) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function redirect(response: ServerResponse, status: number, location: string) {
  response.writeHead(status, { location });
  response.end();
}

// Another origin that records every request it receives.
async function listenForStolenRequests() {
  const received: { url: string; authorization?: string }[] = [];
  const origin = await listen((request, response) => {
    received.push({ url: request.url ?? "", authorization: request.headers.authorization });
    json(response, {});
  });
  return { origin, received };
}

const PUBLIC_INFO = { ServerName: "Home", Version: "10.11.7", Id: "server-1" };
const AUTHENTICATION = { AccessToken: "top-secret", User: { Id: "user-1", Name: "Louise" } };

describe("JellyfinGateway redirects", () => {
  it.each([301, 302, 307, 308])("does not follow a %i on an authenticated request", async (status) => {
    const target = await listenForStolenRequests();
    const server = await listen((request, response) => {
      switch (request.url?.split("?")[0]) {
        case "/System/Info/Public":
          return json(response, PUBLIC_INFO);
        case "/Users/AuthenticateByName":
          return json(response, AUTHENTICATION);
        default:
          return redirect(response, status, `${target.origin}/UserViews`);
      }
    });
    const gateway = new JellyfinGateway(server, undefined, "install-1");
    await gateway.connect();
    await gateway.login("Louise", "hunter2");

    await expect(gateway.userViews()).rejects.toThrow(REDIRECT_REFUSED_MESSAGE);
    expect(target.received).toEqual([]);
  });

  it("does not follow a redirect on the sign-in request", async () => {
    const target = await listenForStolenRequests();
    const server = await listen((request, response) => {
      if (request.url === "/System/Info/Public") return json(response, PUBLIC_INFO);
      return redirect(response, 307, `${target.origin}/Users/AuthenticateByName`);
    });
    const gateway = new JellyfinGateway(server, undefined, "install-1");
    await gateway.connect();

    await expect(gateway.login("Louise", "hunter2")).rejects.toThrow(REDIRECT_REFUSED_MESSAGE);
    expect(target.received).toEqual([]);
  });

  it("does not follow a redirect from the unauthenticated probe", async () => {
    const target = await listenForStolenRequests();
    const server = await listen((_request, response) => redirect(response, 302, `${target.origin}/System/Info/Public`));
    const gateway = new JellyfinGateway(server, undefined, "install-1");

    await expect(gateway.connect()).rejects.toThrow(REDIRECT_REFUSED_MESSAGE);
    expect(target.received).toEqual([]);
  });
});

// What WebKitGTK's fetch returns for `redirect: "manual"`: an opaque redirect
// with status 0, which Axios resolves rather than rejects.
function opaqueRedirect(): Response {
  const response = new Response(null, { status: 200 });
  Object.defineProperty(response, "status", { value: 0 });
  Object.defineProperty(response, "type", { value: "opaqueredirect" });
  return response;
}

describe("JellyfinGateway opaque redirects through the real Axios client", () => {
  it("refuses the probe and authenticated calls", async () => {
    const server = await listen((request, response) => {
      if (request.url === "/System/Info/Public") return json(response, PUBLIC_INFO);
      return json(response, AUTHENTICATION);
    });
    const gateway = new JellyfinGateway(server, undefined, "install-1");
    await gateway.connect();
    await gateway.login("Louise", "hunter2");

    const realFetch = globalThis.fetch;
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      expect(request.redirect).toBe("manual");
      return opaqueRedirect();
    });
    vi.stubGlobal("fetch", fetch);
    await expect(gateway.userViews()).rejects.toThrow(REDIRECT_REFUSED_MESSAGE);
    await expect(new JellyfinGateway(server, undefined, "install-1").connect()).rejects.toThrow(REDIRECT_REFUSED_MESSAGE);
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.stubGlobal("fetch", realFetch);
  });
});
