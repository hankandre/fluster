// @vitest-environment node
// Uses the reference FetchTransport against local HTTP servers, so it proves that no gateway request follows a
// redirect (docs/decisions/0001, edge case 8).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JellyfinGateway, REDIRECT_REFUSED_MESSAGE } from "./gateway";
import { webCrypto } from "../adapters/web-crypto";
import { systemClock } from "../adapters/system-clock";
import { FetchTransport } from "../adapters/fetch-transport";

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

function newGateway(server: string): { gateway: JellyfinGateway; transport: FetchTransport } {
  const transport = new FetchTransport({ client: { version: "0.1.0", deviceName: "Octave Test" }, crypto: webCrypto, clock: systemClock });
  return { gateway: new JellyfinGateway(server, webCrypto, transport, "install-1"), transport };
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
    const { gateway } = newGateway(server);
    await gateway.connect();
    await gateway.login("Louise", "hunter2");

    await expect(gateway.userViews()).rejects.toThrow(REDIRECT_REFUSED_MESSAGE);
    expect(target.received).toEqual([]);
  });

  it("stops an active encoding with header auth, deviceId and playSessionId, and no redirect", async () => {
    const target = await listenForStolenRequests();
    const seen: { method?: string; url: string; authorization?: string }[] = [];
    const server = await listen((request, response) => {
      switch (request.url?.split("?")[0]) {
        case "/System/Info/Public":
          return json(response, PUBLIC_INFO);
        case "/Users/AuthenticateByName":
          return json(response, AUTHENTICATION);
        default:
          seen.push({ method: request.method, url: request.url ?? "", authorization: request.headers.authorization });
          if (seen.length === 1) {
            response.writeHead(204);
            return response.end();
          }
          return redirect(response, 307, `${target.origin}/Videos/ActiveEncodings`);
      }
    });
    const { gateway, transport } = newGateway(server);
    await gateway.connect();
    await gateway.login("Louise", "hunter2");
    const deviceId = /DeviceId="([^"]+)"/.exec(transport.authorizationHeader(gateway.sessionId()))?.[1];

    await gateway.stopActiveEncoding("play-1");
    await expect(gateway.stopActiveEncoding("play-2")).rejects.toThrow(REDIRECT_REFUSED_MESSAGE);

    const first = new URL(seen[0].url, server);
    expect(seen[0].method).toBe("DELETE");
    expect(first.pathname).toBe("/Videos/ActiveEncodings");
    expect(Object.fromEntries(first.searchParams)).toEqual({ deviceId, playSessionId: "play-1" });
    expect(seen[0].authorization).toContain('Token="top-secret"');
    expect(seen[0].url).not.toContain("top-secret");
    expect(target.received).toEqual([]);
  });

  it("does not follow a redirect on the sign-in request", async () => {
    const target = await listenForStolenRequests();
    const server = await listen((request, response) => {
      if (request.url === "/System/Info/Public") return json(response, PUBLIC_INFO);
      return redirect(response, 307, `${target.origin}/Users/AuthenticateByName`);
    });
    const { gateway } = newGateway(server);
    await gateway.connect();

    await expect(gateway.login("Louise", "hunter2")).rejects.toThrow(REDIRECT_REFUSED_MESSAGE);
    expect(target.received).toEqual([]);
  });

  it("does not follow a redirect from the unauthenticated probe", async () => {
    const target = await listenForStolenRequests();
    const server = await listen((_request, response) => redirect(response, 302, `${target.origin}/System/Info/Public`));
    const { gateway } = newGateway(server);

    await expect(gateway.connect()).rejects.toThrow(REDIRECT_REFUSED_MESSAGE);
    expect(target.received).toEqual([]);
  });
});

// What a browser-engine fetch returns for `redirect: "manual"`: an opaque redirect
// with status 0, which the adapter rejects as a redirect.
function opaqueRedirect(): Response {
  const response = new Response(null, { status: 200 });
  Object.defineProperty(response, "status", { value: 0 });
  Object.defineProperty(response, "type", { value: "opaqueredirect" });
  return response;
}

describe("JellyfinGateway opaque redirects through FetchTransport", () => {
  it("refuses the probe and authenticated calls", async () => {
    const server = await listen((request, response) => {
      if (request.url === "/System/Info/Public") return json(response, PUBLIC_INFO);
      return json(response, AUTHENTICATION);
    });
    const { gateway } = newGateway(server);
    await gateway.connect();
    await gateway.login("Louise", "hunter2");

    const realFetch = globalThis.fetch;
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      expect(request.redirect).toBe("manual");
      return opaqueRedirect();
    });
    vi.stubGlobal("fetch", fetch);
    await expect(gateway.userViews()).rejects.toThrow(REDIRECT_REFUSED_MESSAGE);
    await expect(newGateway(server).gateway.connect()).rejects.toThrow(REDIRECT_REFUSED_MESSAGE);
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.stubGlobal("fetch", realFetch);
  });
});
