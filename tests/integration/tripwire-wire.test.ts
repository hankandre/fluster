// T2-09 frozen tests for the tripwire's wire layer (tripwire-wire.ts). Docker-free.
// Signatures chosen here (the implementer follows them):
//   playerFetch(url, { authorization, range?, fetch? }): Promise<Response>
//     always sends the Authorization header and redirect "manual"; rejects when authorization is empty.
//   installWireRecorder(secrets: readonly string[]): { records: WireRecord[]; restore(): void }
//     replaces globalThis.fetch; restore() puts the previous one back.
//   WireRecord = { method, origin, path, queryNames: string[], queryPairs?: [string, string][],
//     flags?: Record<string, boolean>, hasAuthorization, scheme?, hasToken, urlHoldsSecret,
//     redirectMode?, status? }. queryPairs and flags are set for POST /Items/{id}/PlaybackInfo only;
//     flags holds the JSON body's top-level boolean fields.
//   checkWireRequests(records, serverOrigin): string[]  (failure messages, [] when the record passes;
//     a per-request failure message contains that request's path)
import { afterEach, describe, expect, it } from "vitest";
import { checkWireRequests, installWireRecorder, playerFetch, type WireRecord } from "./tripwire-wire";

const ORIGIN = "http://127.0.0.1:18098";
const TOKEN = "tok-SECRET-0123456789";
const AUTH = `MediaBrowser Client="Octave", Device="tripwire", DeviceId="d", Version="1", Token="${TOKEN}"`;

function stubFetch(calls: { url: string; init?: RequestInit }[], status = 200): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response("", { status });
  }) as typeof fetch;
}

describe("T2-09 item 1: playerFetch sends the header and refuses redirects", () => {
  it("sends the Authorization header and redirect manual on a plain request", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    await playerFetch(`${ORIGIN}/Videos/a/stream?Static=true`, { authorization: AUTH, fetch: stubFetch(calls) });
    expect(calls).toHaveLength(1);
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("authorization")).toBe(AUTH);
    expect(headers.has("range")).toBe(false);
    expect(calls[0].init?.redirect).toBe("manual");
  });

  it("sends the header, the Range and redirect manual on a ranged request", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    await playerFetch(`${ORIGIN}/Videos/a/stream?Static=true`, { authorization: AUTH, range: "bytes=0-1023", fetch: stubFetch(calls) });
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("authorization")).toBe(AUTH);
    expect(headers.get("range")).toBe("bytes=0-1023");
    expect(calls[0].init?.redirect).toBe("manual");
  });

  it("refuses to send a request without a header", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    await expect(playerFetch(`${ORIGIN}/Videos/a/stream`, { authorization: "", fetch: stubFetch(calls) })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("T2-09 item 6: the recorder keeps no secret", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("records what a request looked like and holds the token nowhere", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = stubFetch(calls);
    const wire = installWireRecorder([TOKEN]);
    await fetch(`${ORIGIN}/Items?Recursive=true`, { headers: { Authorization: AUTH }, redirect: "manual" });
    wire.restore();
    expect(wire.records).toHaveLength(1);
    expect(wire.records[0]).toMatchObject({
      method: "GET",
      origin: ORIGIN,
      path: "/Items",
      queryNames: ["Recursive"],
      hasAuthorization: true,
      scheme: "MediaBrowser",
      hasToken: true,
      urlHoldsSecret: false,
      redirectMode: "manual",
      status: 200,
    });
    expect(JSON.stringify(wire.records)).not.toContain(TOKEN);
    expect(JSON.stringify(wire.records)).not.toContain("Recursive=true");
  });

  it("passes the call through to the fetch it replaced, then restore puts that fetch back", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const stub = stubFetch(calls);
    globalThis.fetch = stub;
    const wire = installWireRecorder([TOKEN]);
    expect(globalThis.fetch).not.toBe(stub);
    await fetch(`${ORIGIN}/Items`, { headers: new Headers({ Authorization: AUTH }), redirect: "manual" });
    expect(calls).toHaveLength(1);
    wire.restore();
    expect(globalThis.fetch).toBe(stub);
  });

  it("marks a request that has no header, no Token, a secret in its URL, or no redirect mode", async () => {
    globalThis.fetch = stubFetch([]);
    const wire = installWireRecorder([TOKEN]);
    await fetch(`${ORIGIN}/Videos/a/stream?x=${TOKEN}`);
    wire.restore();
    expect(wire.records[0]).toMatchObject({ hasAuthorization: false, hasToken: false, urlHoldsSecret: true });
    expect(wire.records[0].redirectMode === undefined || wire.records[0].redirectMode === "follow").toBe(true);
    expect(JSON.stringify(wire.records)).not.toContain(TOKEN);
  });

  it("keeps the query pairs and the body's boolean flags for PlaybackInfo only", async () => {
    globalThis.fetch = stubFetch([]);
    const wire = installWireRecorder([TOKEN]);
    const body = JSON.stringify({ EnableDirectPlay: false, AllowVideoStreamCopy: false, Name: "x", DeviceProfile: { Name: "p", Flag: true } });
    await fetch(`${ORIGIN}/Items/abc/PlaybackInfo?EnableDirectPlay=false&AllowVideoStreamCopy=false&UserId=u`, {
      method: "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body,
      redirect: "manual",
    });
    await fetch(`${ORIGIN}/Items?Limit=5`, { headers: { Authorization: AUTH }, redirect: "manual" });
    wire.restore();
    const [info, other] = wire.records;
    expect(info.method).toBe("POST");
    expect(info.flags).toEqual({ EnableDirectPlay: false, AllowVideoStreamCopy: false });
    expect(info.queryPairs).toEqual(expect.arrayContaining([["EnableDirectPlay", "false"], ["AllowVideoStreamCopy", "false"]]));
    expect(other.flags).toBeUndefined();
    expect(other.queryPairs).toBeUndefined();
    expect(JSON.stringify(wire.records)).not.toContain("DeviceProfile");
  });
});

function record(overrides: Partial<WireRecord> = {}): WireRecord {
  return {
    method: "GET",
    origin: ORIGIN,
    path: "/Items/abc",
    queryNames: [],
    hasAuthorization: true,
    scheme: "MediaBrowser",
    hasToken: true,
    urlHoldsSecret: false,
    redirectMode: "manual",
    status: 200,
    ...overrides,
  };
}

describe("T2-09 item 6: checkWireRequests", () => {
  it("passes a record shaped like a real run", () => {
    const records = [
      record({ method: "GET", path: "/System/Info/Public", hasToken: false }),
      record({ method: "POST", path: "/Users/AuthenticateByName", hasToken: false }),
      record({ method: "POST", path: "/Items/abc/PlaybackInfo", queryNames: ["EnableDirectPlay"] }),
      record({ method: "GET", path: "/Videos/abc/stream", queryNames: ["Static", "MediaSourceId"], status: 206 }),
      record({ method: "GET", path: "/videos/abc/master.m3u8", queryNames: ["EnableTrickplay"] }),
      record({ method: "POST", path: "/Sessions/Playing/Stopped", status: 204 }),
    ];
    expect(checkWireRequests(records, ORIGIN)).toEqual([]);
  });

  it("fails an empty record", () => {
    expect(checkWireRequests([], ORIGIN).length).toBeGreaterThan(0);
  });

  const bad: [string, Partial<WireRecord>][] = [
    ["no Authorization header", { hasAuthorization: false, scheme: undefined, hasToken: false }],
    ["a scheme other than MediaBrowser", { scheme: "Bearer" }],
    ["a signed-in route without Token=", { hasToken: false }],
    ["a credential query name", { queryNames: ["Static", "api_key"] }],
    ["a credential query name in any case", { queryNames: ["ApiKey"] }],
    ["an upper-case access token name", { queryNames: ["ACCESS_TOKEN"] }],
    ["a URL holding a known secret", { urlHoldsSecret: true }],
    ["another origin", { origin: "http://127.0.0.1:18096" }],
    ["a redirect mode other than manual", { redirectMode: "follow" }],
    ["no redirect mode", { redirectMode: undefined }],
    ["a 3xx answer", { status: 302 }],
  ];
  for (const [name, overrides] of bad) {
    it(`fails ${name}, naming the request`, () => {
      const failures = checkWireRequests([record({ path: "/Items/needle", ...overrides })], ORIGIN);
      expect(failures.length).toBeGreaterThan(0);
      expect(failures.some((failure) => failure.includes("/Items/needle"))).toBe(true);
    });
  }

  it("exempts only GET /System/Info/Public and POST /Users/AuthenticateByName from Token=", () => {
    expect(checkWireRequests([record({ method: "POST", path: "/System/Info/Public", hasToken: false })], ORIGIN).length).toBeGreaterThan(0);
    expect(checkWireRequests([record({ method: "GET", path: "/Users/AuthenticateByName", hasToken: false })], ORIGIN).length).toBeGreaterThan(0);
    expect(checkWireRequests([record({ method: "GET", path: "/System/Info/Public/x", hasToken: false })], ORIGIN).length).toBeGreaterThan(0);
    expect(checkWireRequests([record({ method: "GET", path: "/Users/Me", hasToken: false })], ORIGIN).length).toBeGreaterThan(0);
  });

  it("still requires the header and manual redirects on the two exempt routes", () => {
    expect(checkWireRequests([record({ method: "GET", path: "/System/Info/Public", hasToken: false, hasAuthorization: false, scheme: undefined })], ORIGIN).length).toBeGreaterThan(0);
    expect(checkWireRequests([record({ method: "POST", path: "/Users/AuthenticateByName", hasToken: false, redirectMode: "follow" })], ORIGIN).length).toBeGreaterThan(0);
  });

  it("reports one bad request among good ones", () => {
    const records = [record(), record({ path: "/Items/needle", hasAuthorization: false, scheme: undefined, hasToken: false }), record()];
    const failures = checkWireRequests(records, ORIGIN);
    expect(failures.some((failure) => failure.includes("/Items/needle"))).toBe(true);
  });
});
