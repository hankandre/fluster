// @vitest-environment node
// T2-04 acceptance item 3, adapter side: FetchTransport never follows a redirect (docs/decisions/0001, edge
// case 8). A 3xx answer and an opaque answer with status 0 reject with code "redirect" on the probe, on
// sign-in, on an authenticated call, on a playstate report and on sign-out, and no other origin receives a
// request. FetchTransport is the only place in the core that sets `redirect: "manual"`.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransportError, type SessionId } from "../ports/transport";
import { systemClock } from "./system-clock";
import { webCrypto } from "./web-crypto";
import { FetchTransport } from "./fetch-transport";

const servers: Server[] = [];

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function json(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const AUTHENTICATION = { AccessToken: "top-secret", User: { Id: "user-1", Name: "Louise" } };

// Another origin that records every request it receives.
async function listenForStolenRequests() {
  const received: { url: string; authorization?: string }[] = [];
  const origin = await listen((request, response) => {
    received.push({ url: request.url ?? "", authorization: request.headers.authorization });
    json(response, {});
  });
  return { origin, received };
}

// The fetch the adapter sees: the real one, recorded, unless a test asks for an opaque redirect.
type FetchMode = "real" | "opaque";
let fetchMode: FetchMode = "real";
const fetchSeen: { redirect: string | undefined; url: string }[] = [];
const realFetch = globalThis.fetch;

function opaqueRedirect(): Response {
  const response = new Response(null, { status: 200 });
  Object.defineProperty(response, "status", { value: 0 });
  Object.defineProperty(response, "type", { value: "opaqueredirect" });
  return response;
}

function installFetch(): void {
  fetchMode = "real";
  fetchSeen.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = typeof input === "object" && "redirect" in input ? (input as Request) : undefined;
      fetchSeen.push({ redirect: init?.redirect ?? request?.redirect, url: String(request?.url ?? input) });
      if (fetchMode === "opaque") return opaqueRedirect();
      return realFetch(input as string, init);
    }),
  );
}

function transport(): FetchTransport {
  return new FetchTransport({ client: { version: "0.1.0", deviceName: "Octave Test" }, crypto: webCrypto, clock: systemClock });
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

type Surface = "probe" | "sign-in" | "authenticated call" | "report" | "sign-out";
const SURFACES: Surface[] = ["probe", "sign-in", "authenticated call", "report", "sign-out"];

// Redirects only the request a test names; the sign-in that makes a session is always answered.
function route(redirectOn: () => Surface | undefined, status: number, target: string) {
  const surfaceOf = (request: IncomingMessage): Surface | "setup" => {
    const key = `${request.method} ${request.url?.split("?")[0]}`;
    switch (key) {
      case "GET /System/Info/Public":
        return "probe";
      case "POST /Users/AuthenticateByName":
        return redirectOn() === "sign-in" ? "sign-in" : "setup";
      case "GET /UserViews":
        return "authenticated call";
      case "POST /Sessions/Playing/Progress":
        return "report";
      case "POST /Sessions/Logout":
        return "sign-out";
      default:
        return "setup";
    }
  };
  return (request: IncomingMessage, response: ServerResponse) => {
    request.resume();
    const surface = surfaceOf(request);
    if (surface !== "setup" && surface === redirectOn()) {
      response.writeHead(status, { location: `${target}${request.url}` });
      return response.end();
    }
    if (request.url?.startsWith("/Users/")) return json(response, AUTHENTICATION);
    return json(response, { Items: [] });
  };
}

async function signIn(adapter: FetchTransport, server: string): Promise<SessionId> {
  const { session } = await adapter.signIn({
    server,
    deviceId: "device-1",
    credential: { kind: "password", username: "Louise", password: "hunter2" },
    timeoutMs: 5_000,
  });
  return session;
}

async function attempt(adapter: FetchTransport, server: string, session: SessionId | undefined, surface: Surface): Promise<unknown> {
  switch (surface) {
    case "probe":
      return adapter.request({ target: { server, deviceId: "octave-unauthenticated" }, method: "GET", path: "/System/Info/Public", timeoutMs: 5_000 });
    case "sign-in":
      return signIn(adapter, server);
    case "authenticated call":
      return adapter.request({ target: { session: session! }, method: "GET", path: "/UserViews", query: [["userId", "user-1"]], timeoutMs: 5_000 });
    case "report":
      return adapter.request({ target: { session: session! }, method: "POST", path: "/Sessions/Playing/Progress", body: { ItemId: "item-1" }, timeoutMs: 3_000 });
    case "sign-out":
      return adapter.endSession(session!, { timeoutMs: 3_000 });
  }
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe.each([301, 302, 307, 308])("FetchTransport and a %i answer", (status) => {
  it.each(SURFACES)("rejects with code redirect on the %s and the target receives no request", async (surface) => {
    installFetch();
    const target = await listenForStolenRequests();
    let redirectOn: Surface | undefined;
    const server = await listen(route(() => redirectOn, status, target.origin));
    const adapter = transport();
    const session = surface === "sign-in" || surface === "probe" ? undefined : await signIn(adapter, server);

    redirectOn = surface;
    const error = await failureOf(attempt(adapter, server, session, surface));

    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).code).toBe("redirect");
    expect(target.received).toEqual([]);
  });

  it("does not return the redirect as a response", async () => {
    installFetch();
    const target = await listenForStolenRequests();
    const server = await listen(route(() => "authenticated call", status, target.origin));
    const adapter = transport();
    const session = await signIn(adapter, server);
    await expect(attempt(adapter, server, session, "authenticated call")).rejects.toBeInstanceOf(TransportError);
    expect(target.received).toEqual([]);
  });
});

describe("FetchTransport and fetch", () => {
  it('passes redirect: "manual" on every call', async () => {
    installFetch();
    const server = await listen(route(() => undefined, 302, "http://127.0.0.1:1"));
    const adapter = transport();
    const session = await signIn(adapter, server);
    for (const surface of SURFACES) await attempt(adapter, server, session, surface === "sign-in" ? "probe" : surface);

    expect(fetchSeen.length).toBeGreaterThanOrEqual(6);
    expect(fetchSeen.every((call) => call.redirect === "manual")).toBe(true);
  });

  it.each(SURFACES)("rejects an opaque answer with status 0 on the %s", async (surface) => {
    installFetch();
    const server = await listen(route(() => undefined, 302, "http://127.0.0.1:1"));
    const adapter = transport();
    const session = surface === "sign-in" || surface === "probe" ? undefined : await signIn(adapter, server);

    fetchMode = "opaque";
    const error = await failureOf(attempt(adapter, server, session, surface));

    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).code).toBe("redirect");
  });

  it("answers normally when the server answers 200 (positive control)", async () => {
    installFetch();
    const server = await listen(route(() => undefined, 302, "http://127.0.0.1:1"));
    const adapter = transport();
    const session = await signIn(adapter, server);
    await expect(attempt(adapter, server, session, "authenticated call")).resolves.toMatchObject({ status: 200, body: { Items: [] } });
    await expect(attempt(adapter, server, session, "sign-out")).resolves.toBeUndefined();
  });
});
