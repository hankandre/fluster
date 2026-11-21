// @vitest-environment node
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { FakeClock } from "../ports/fake-clock";
import { TransportError, type SessionId } from "../ports/transport";
import { FetchTransport } from "./fetch-transport";
import { systemClock } from "./system-clock";
import { webCrypto } from "./web-crypto";

const TOKEN = "tok+en/=é-0123";
const servers: Server[] = [];
const seen: { method: string; url: string; headers: IncomingMessage["headers"]; body: string }[] = [];
let answer: (request: IncomingMessage, response: ServerResponse) => void = (_request, response) => json(response, 200, {});

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function listen(prefix = ""): Promise<string> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      seen.push({ method: request.method ?? "", url: request.url ?? "", headers: request.headers, body: Buffer.concat(chunks).toString("utf8") });
      if ((request.url ?? "").startsWith(`${prefix}/Users/Authenticate`)) {
        return json(response, 200, { AccessToken: TOKEN, ServerId: "server-9", User: { Id: "user-1", Name: "Louise" } });
      }
      answer(request, response);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}${prefix}`;
}

function transport(clock = systemClock): FetchTransport {
  return new FetchTransport({ client: { version: "0.1.0", deviceName: "Octave Test" }, crypto: webCrypto, clock });
}

async function signIn(adapter: FetchTransport, server: string): Promise<SessionId> {
  const { session } = await adapter.signIn({ server, deviceId: "device-1", credential: { kind: "password", username: "Louise", password: "hunter2" }, timeoutMs: 5_000 });
  return session;
}

async function failureOf(promise: Promise<unknown>): Promise<TransportError> {
  return promise.then(
    () => {
      throw new Error("expected a failure");
    },
    (error: unknown) => error as TransportError,
  );
}

afterEach(async () => {
  seen.length = 0;
  answer = (_request, response) => json(response, 200, {});
  await Promise.all(
    servers.splice(0).map((server) => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    }),
  );
});

describe("FetchTransport sign-in", () => {
  it("posts the password body and returns the session, user and server Id without the token", async () => {
    const server = await listen();
    const adapter = transport();
    const result = await adapter.signIn({ server, deviceId: "device-1", credential: { kind: "password", username: "Louise", password: "hunter2" }, timeoutMs: 5_000 });
    expect(seen[0]).toMatchObject({ method: "POST", url: "/Users/AuthenticateByName", body: '{"Username":"Louise","Pw":"hunter2"}' });
    expect(seen[0]?.headers["content-type"]).toBe("application/json");
    expect(seen[0]?.headers.accept).toBe("application/json");
    expect(result).toEqual({ session: expect.any(String), userId: "user-1", userName: "Louise", serverId: "server-9" });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(result.session).not.toContain("tok");
  });

  it("posts the Quick Connect secret", async () => {
    const server = await listen();
    await transport().signIn({ server, deviceId: "device-1", credential: { kind: "quick-connect", secret: "qc" }, timeoutMs: 5_000 });
    expect(seen[0]).toMatchObject({ url: "/Users/AuthenticateWithQuickConnect", body: '{"Secret":"qc"}' });
  });

  it("rejects an answer without AccessToken or User.Id as unexpected-response", async () => {
    const server = await listen();
    for (const body of [{ User: { Id: "u" } }, { AccessToken: "t" }, { AccessToken: "", User: { Id: "u" } }]) {
      const bad = createServer((_request, response) => json(response, 200, body));
      servers.push(bad);
      await new Promise<void>((resolve) => bad.listen(0, "127.0.0.1", resolve));
      const url = `http://127.0.0.1:${(bad.address() as AddressInfo).port}`;
      const error = await failureOf(transport().signIn({ server: url, deviceId: "d", credential: { kind: "password", username: "a", password: "b" }, timeoutMs: 5_000 }));
      expect(error.code).toBe("unexpected-response");
    }
    expect(server).toBeDefined();
  });

  it("rejects a 401 with its status and no body", async () => {
    const server = createServer((_request, response) => json(response, 401, { Message: "secret detail" }));
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const error = await failureOf(transport().signIn({ server: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, deviceId: "d", credential: { kind: "password", username: "a", password: "b" }, timeoutMs: 5_000 }));
    expect(error).toMatchObject({ code: "status", status: 401 });
    expect(error.message).not.toContain("secret detail");
  });

  it("refuses a server address that is not http or https or carries user info, before sending", async () => {
    for (const server of ["ftp://media.test", "not a url", "http://user:pw@media.test"]) {
      const error = await failureOf(transport().signIn({ server, deviceId: "d", credential: { kind: "password", username: "a", password: "b" }, timeoutMs: 5_000 }));
      expect(error.code).toBe("refused");
    }
  });
});

describe("FetchTransport requests", () => {
  it("keeps a reverse-proxy base path and sends the session's token header", async () => {
    const server = await listen("/jellyfin");
    const adapter = transport();
    const session = await signIn(adapter, server);
    await adapter.request({ target: { session }, method: "GET", path: "/UserViews", timeoutMs: 5_000 });
    expect(seen[1]?.url).toBe("/jellyfin/UserViews");
    expect(seen[1]?.headers.authorization).toContain(`Token="${encodeURIComponent(TOKEN)}"`);
    expect(seen[1]?.headers.authorization).toContain('DeviceId="device-1"');
    expect(seen[1]?.headers.authorization).toContain('Client="Octave"');
    expect(seen[1]?.headers.authorization).toContain('Device="Octave%20Test"');
    expect(seen[1]?.headers.authorization).toContain('Version="0.1.0"');
  });

  it("writes the query as Axios did: ordered pairs, a space as +, : $ and , bare", async () => {
    const server = await listen();
    const adapter = transport();
    const session = await signIn(adapter, server);
    await adapter.request({ target: { session }, method: "GET", path: "/Items", query: [["searchTerm", "a b+c:$,[x]"], ["limit", "8"], ["includeSegmentTypes", "Intro"], ["includeSegmentTypes", "Outro"]], timeoutMs: 5_000 });
    expect(seen[1]?.url).toBe("/Items?searchTerm=a+b%2Bc:$,%5Bx%5D&limit=8&includeSegmentTypes=Intro&includeSegmentTypes=Outro");
  });

  it("sends a JSON body with Content-Type only when there is one", async () => {
    const server = await listen();
    const adapter = transport();
    const session = await signIn(adapter, server);
    await adapter.request({ target: { session }, method: "POST", path: "/Users/Configuration", body: { A: 1 }, timeoutMs: 5_000 });
    await adapter.request({ target: { session }, method: "DELETE", path: "/UserFavoriteItems/x", timeoutMs: 5_000 });
    expect(seen[1]).toMatchObject({ method: "POST", body: '{"A":1}' });
    expect(seen[1]?.headers["content-type"]).toBe("application/json");
    expect(seen[2]).toMatchObject({ method: "DELETE", body: "" });
    expect(seen[2]?.headers["content-type"]).toBeUndefined();
  });

  it("resolves a 404 and a 500 with their status and the parsed body", async () => {
    const server = await listen();
    const adapter = transport();
    const session = await signIn(adapter, server);
    answer = (request, response) => json(response, request.url === "/a" ? 404 : 500, { Message: "x" });
    await expect(adapter.request({ target: { session }, method: "GET", path: "/a", timeoutMs: 5_000 })).resolves.toEqual({ status: 404, body: { Message: "x" } });
    await expect(adapter.request({ target: { session }, method: "GET", path: "/b", timeoutMs: 5_000 })).resolves.toMatchObject({ status: 500 });
  });

  it("gives body undefined for an empty answer and for text that is not JSON", async () => {
    const server = await listen();
    const adapter = transport();
    const session = await signIn(adapter, server);
    answer = (request, response) => {
      if (request.url === "/empty") {
        response.writeHead(204);
        return void response.end();
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html>proxy error</html>");
    };
    await expect(adapter.request({ target: { session }, method: "GET", path: "/empty", timeoutMs: 5_000 })).resolves.toEqual({ status: 204, body: undefined });
    await expect(adapter.request({ target: { session }, method: "GET", path: "/html", timeoutMs: 5_000 })).resolves.toEqual({ status: 200, body: undefined });
  });

  it("replaces the token, raw and percent-encoded, in every string and key of a body", async () => {
    const server = await listen();
    const adapter = transport();
    const session = await signIn(adapter, server);
    const encoded = encodeURIComponent(TOKEN);
    answer = (_request, response) => json(response, 200, { Raw: TOKEN, Items: [`x?ApiKey=${encoded}&y`, { [TOKEN]: encoded.replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase()) }], Keep: "other" });
    const result = await adapter.request({ target: { session }, method: "GET", path: "/Items", timeoutMs: 5_000 });
    expect(JSON.stringify(result.body)).not.toContain(TOKEN);
    expect(JSON.stringify(result.body)).not.toContain(encoded);
    expect(result.body).toEqual({ Raw: "[redacted]", Items: ["x?ApiKey=[redacted]&y", { "[redacted]": "[redacted]" }], Keep: "other" });
  });

  it("leaves a body alone before sign-in (negative control: no token to strip)", async () => {
    const server = await listen();
    answer = (_request, response) => json(response, 200, { Echo: TOKEN });
    const result = await transport().request({ target: { server, deviceId: "octave-unauthenticated" }, method: "GET", path: "/System/Info/Public", timeoutMs: 5_000 });
    expect(result.body).toEqual({ Echo: TOKEN });
  });
});

describe("FetchTransport refusals", () => {
  async function refused(promise: Promise<unknown>): Promise<void> {
    const error = await failureOf(promise);
    expect(error).toBeInstanceOf(TransportError);
    expect(error.code).toBe("refused");
  }

  it("refuses before sending: an unknown session, a pre-sign-in route outside the list, a bad path", async () => {
    const server = await listen();
    const adapter = transport();
    const session = await signIn(adapter, server);
    seen.length = 0;
    await refused(adapter.request({ target: { session: "nope" }, method: "GET", path: "/UserViews", timeoutMs: 5_000 }));
    await refused(adapter.request({ target: { server, deviceId: "d" }, method: "GET", path: "/UserViews", timeoutMs: 5_000 }));
    await refused(adapter.request({ target: { server, deviceId: "d" }, method: "POST", path: "/System/Info/Public", timeoutMs: 5_000 }));
    for (const path of ["UserViews", "/a?b=c", "/a#b", "//evil"]) {
      await refused(adapter.request({ target: { session }, method: "GET", path, timeoutMs: 5_000 }));
    }
    await refused(adapter.request({ target: { session }, method: "GET", path: "/UserViews", timeoutMs: 0 }));
    expect(seen).toEqual([]);
  });

  it("allows every pre-sign-in route", async () => {
    const server = await listen();
    const adapter = transport();
    for (const [method, path] of [["GET", "/System/Info/Public"], ["GET", "/QuickConnect/Enabled"], ["POST", "/QuickConnect/Initiate"], ["GET", "/QuickConnect/Connect"]] as const) {
      await expect(adapter.request({ target: { server, deviceId: "d" }, method, path, timeoutMs: 5_000 })).resolves.toMatchObject({ status: 200 });
    }
    expect(seen.every((entry) => entry.headers.authorization?.endsWith('Token=""'))).toBe(true);
  });

  it("refuses a credential query name in any case and the token value in the path or the query", async () => {
    const server = await listen();
    const adapter = transport();
    const session = await signIn(adapter, server);
    seen.length = 0;
    for (const name of ["ApiKey", "api_key", "ACCESS_TOKEN", "token", "X-Emby-Token", "ApiToken", "AccessToken"]) {
      await refused(adapter.request({ target: { session }, method: "GET", path: "/Items", query: [[name, "x"]], timeoutMs: 5_000 }));
    }
    await refused(adapter.request({ target: { session }, method: "GET", path: "/Items", query: [["term", TOKEN]], timeoutMs: 5_000 }));
    await refused(adapter.request({ target: { session }, method: "GET", path: "/Items", query: [["term", encodeURIComponent(TOKEN)]], timeoutMs: 5_000 }));
    await refused(adapter.request({ target: { session }, method: "GET", path: `/Items/${encodeURIComponent(TOKEN)}`, timeoutMs: 5_000 }));
    expect(seen).toEqual([]);
  });

  it("lets the Quick Connect poll secret through, which is not the access token", async () => {
    const server = await listen();
    await expect(transport().request({ target: { server, deviceId: "d" }, method: "GET", path: "/QuickConnect/Connect", query: [["secret", "qc"]], timeoutMs: 5_000 })).resolves.toMatchObject({ status: 200 });
    expect(seen[0]?.url).toBe("/QuickConnect/Connect?secret=qc");
  });
});

describe("FetchTransport timeouts, cancellation and network failures", () => {
  it("times out through the injected Clock", async () => {
    const server = await listen();
    const clock = new FakeClock();
    const adapter = transport(clock);
    const session = await signIn(adapter, server);
    answer = () => undefined;
    const pending = failureOf(adapter.request({ target: { session }, method: "GET", path: "/slow", timeoutMs: 15_000 }));
    while (clock.pending() === 0) await Promise.resolve();
    await clock.advance(15_000);
    expect((await pending).code).toBe("timeout");
    expect(clock.pending()).toBe(0);
  });

  it("cancels on the caller's signal with an AbortError, and before sending when already aborted", async () => {
    const server = await listen();
    const adapter = transport();
    const session = await signIn(adapter, server);
    answer = () => undefined;
    const controller = new AbortController();
    const pending = failureOf(adapter.request({ target: { session }, method: "GET", path: "/slow", timeoutMs: 15_000, signal: controller.signal }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    const error = await pending;
    expect(error.code).toBe("cancelled");
    expect(error.name).toBe("AbortError");

    seen.length = 0;
    const before = await failureOf(adapter.request({ target: { session }, method: "GET", path: "/x", timeoutMs: 5_000, signal: controller.signal }));
    expect(before.code).toBe("cancelled");
    expect(seen).toEqual([]);
  });

  it("maps a refused connection and a reset to network without the address in the message", async () => {
    const server = await listen();
    const adapter = transport();
    const session = await signIn(adapter, server);
    answer = (request) => void request.socket.destroy();
    const reset = await failureOf(adapter.request({ target: { session }, method: "GET", path: "/x", timeoutMs: 5_000 }));
    expect(reset.code).toBe("network");
    expect(reset.message).not.toMatch(/127\.0\.0\.1|ECONN/);
    expect("cause" in reset).toBe(false);
    const refused = await failureOf(transport().request({ target: { server: "http://127.0.0.1:1", deviceId: "d" }, method: "GET", path: "/System/Info/Public", timeoutMs: 5_000 }));
    expect(refused.code).toBe("network");
  });

  it("carries no token in any error it throws", async () => {
    const server = await listen();
    const adapter = transport();
    const session = await signIn(adapter, server);
    answer = (_request, response) => json(response, 500, { Message: TOKEN });
    const status = await adapter.request({ target: { session }, method: "GET", path: "/x", timeoutMs: 5_000 });
    expect(JSON.stringify(status)).not.toContain(TOKEN);
    const failures = [
      await failureOf(adapter.request({ target: { session }, method: "GET", path: "/x", query: [["token", TOKEN]], timeoutMs: 5_000 })),
      await failureOf(adapter.request({ target: { session: "nope" }, method: "GET", path: "/x", timeoutMs: 5_000 })),
    ];
    for (const error of failures) expect(`${error.message}${error.stack}${JSON.stringify(error)}`).not.toContain(TOKEN);
  });
});

describe("FetchTransport sessions", () => {
  it("ends the session locally before the server call and posts the logout with the token", async () => {
    const server = await listen();
    const adapter = transport();
    const session = await signIn(adapter, server);
    answer = (_request, response) => {
      response.writeHead(204);
      response.end();
    };
    await adapter.endSession(session, { timeoutMs: 3_000 });
    expect(seen[1]).toMatchObject({ method: "POST", url: "/Sessions/Logout" });
    expect(seen[1]?.headers.authorization).toContain(`Token="${encodeURIComponent(TOKEN)}"`);
    expect(() => adapter.authorizationHeader(session)).toThrow(/Sign in/);
    await refusedAfterEnd(adapter, session);
  });

  async function refusedAfterEnd(adapter: FetchTransport, session: SessionId): Promise<void> {
    const error = await failureOf(adapter.request({ target: { session }, method: "GET", path: "/UserViews", timeoutMs: 5_000 }));
    expect(error.code).toBe("refused");
  }

  it("still ends the session when the server logout fails, and reports the failure", async () => {
    const server = await listen();
    const adapter = transport();
    const session = await signIn(adapter, server);
    answer = (_request, response) => json(response, 500, {});
    const error = await failureOf(adapter.endSession(session, { timeoutMs: 3_000 }));
    expect(error).toMatchObject({ code: "status", status: 500 });
    await refusedAfterEnd(adapter, session);
  });

  it("builds the signed-in header for a session and throws for an unknown one", async () => {
    const server = await listen();
    const adapter = transport();
    const session = await signIn(adapter, server);
    expect(adapter.authorizationHeader(session)).toBe(
      `MediaBrowser Client="Octave", Device="Octave%20Test", DeviceId="device-1", Version="0.1.0", Token="${encodeURIComponent(TOKEN)}"`,
    );
    expect(() => adapter.authorizationHeader("nope")).toThrow(/Sign in/);
  });

  it("keeps the token out of every property it exposes", async () => {
    const server = await listen();
    const adapter = transport();
    await signIn(adapter, server);
    expect(Reflect.ownKeys(adapter)).toEqual([]);
    expect(JSON.stringify(adapter)).toBe("{}");
  });

  it("keeps sessions apart: two sign-ins give two ids", async () => {
    const server = await listen();
    const adapter = transport();
    const first = await signIn(adapter, server);
    const second = await signIn(adapter, server);
    expect(first).not.toBe(second);
    await adapter.endSession(first, { timeoutMs: 3_000 });
    expect(adapter.authorizationHeader(second)).toContain("MediaBrowser");
  });
});
