// @vitest-environment node
// T2-04 acceptance item 2: the core's header builder serves the reference transport and builds the
// MediaBrowser Authorization value byte for byte as @jellyfin/sdk 1.0.2 did. On Android the header is built
// in Kotlin (decision 0005); T3-03's Kotlin test reads the same fixture.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { systemClock } from "../adapters/system-clock";
import { webCrypto } from "../adapters/web-crypto";
import { FetchTransport } from "../adapters/fetch-transport";
import { buildAuthorizationHeader } from "./authorization-header";
import fixture from "../../tests/fixtures/authorization-header.json";

interface Vector {
  name: string;
  client: string;
  version: string;
  device: string;
  deviceId: string;
  token?: string;
  expected: string;
  expectedWithoutToken: string;
}
const vectors = fixture.vectors as Vector[];

describe("the recorded header vectors", () => {
  it("hold the three values the spec recorded from the SDK", () => {
    expect(vectors.find((v) => v.name === "typical")?.expected).toBe(
      'MediaBrowser Client="Octave", Device="Octave%20Android%20TV", DeviceId="07bce1a97d44b7008418adc02ad74694142287bef4bd4007377574dc451aaf78", Version="0.1.0", Token="0123456789abcdef0123456789abcdef"',
    );
    expect(vectors.find((v) => v.name === "typical")?.expectedWithoutToken.endsWith('Token=""')).toBe(true);
    expect(vectors.find((v) => v.name === "special-characters")?.expected).toBe(
      'MediaBrowser Client="Octave", Device="Salon%20d%E2%80%99%C3%89t%C3%A9%20%22TV%22%2C%204K%20(a*b~c!)%20it\'s", DeviceId="id%20with%20space%2F%26%3D", Version="1.2.3-beta%2B5", Token="tok%2Ben%2F%3D%22%25%C3%A9\'"',
    );
  });
});

describe.each(vectors.map((vector) => [vector.name, vector] as const))("buildAuthorizationHeader (%s)", (_name, vector) => {
  const inputs = { client: vector.client, device: vector.device, deviceId: vector.deviceId, version: vector.version };

  it("builds the recorded value byte for byte", () => {
    expect(buildAuthorizationHeader({ ...inputs, token: vector.token })).toBe(vector.expected);
  });

  it('writes Token="" when there is no token', () => {
    expect(buildAuthorizationHeader(inputs)).toBe(vector.expectedWithoutToken);
    expect(buildAuthorizationHeader({ ...inputs, token: undefined })).toBe(vector.expectedWithoutToken);
  });

  it("does not equal a value with one quote removed or %20 written as +", () => {
    const built = buildAuthorizationHeader({ ...inputs, token: vector.token });
    expect(built).not.toBe(vector.expected.replace('"', ""));
    if (vector.expected.includes("%20")) expect(built).not.toBe(vector.expected.replace("%20", "+"));
    expect(built).not.toBe(vector.expected.replace(", ", ","));
    expect(built).not.toBe(`${vector.expected} `);
  });
});

describe("the negative control is not vacuous", () => {
  it("a vector with %20 has a + variant that differs from the output", () => {
    const withSpace = vectors.find((vector) => vector.expected.includes("%20"));
    expect(withSpace).toBeDefined();
    expect(withSpace!.expected.replace("%20", "+")).not.toBe(withSpace!.expected);
  });
});

describe("FetchTransport sends the recorded header", () => {
  const servers: Server[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  });

  async function serve(token: string, seen: string[]): Promise<string> {
    const server = createServer((request, response) => {
      seen.push(String(request.headers.authorization ?? ""));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(request.url?.startsWith("/Users/") ? { AccessToken: token, User: { Id: "user-1", Name: "Louise" } } : { Items: [] }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it.each(vectors.filter((vector) => vector.token !== undefined).map((vector) => [vector.name, vector] as const))(
    "signs in with the tokenless header and sends the token header afterwards (%s)",
    async (_name, vector) => {
      const seen: string[] = [];
      const server = await serve(vector.token!, seen);
      const transport = new FetchTransport({
        client: { version: vector.version, deviceName: vector.device },
        crypto: webCrypto,
        clock: systemClock,
      });
      const { session } = await transport.signIn({
        server,
        deviceId: vector.deviceId,
        credential: { kind: "password", username: "Louise", password: "hunter2" },
        timeoutMs: 5_000,
      });
      await transport.request({ target: { session }, method: "GET", path: "/UserViews", timeoutMs: 5_000 });

      expect(seen).toHaveLength(2);
      expect(seen[0]).toBe(vector.expectedWithoutToken);
      expect(seen[1]).toBe(vector.expected);
    },
  );

  it("sends the tokenless header with the pre-sign-in DeviceId on the probe", async () => {
    const seen: string[] = [];
    const server = await serve("unused", seen);
    const transport = new FetchTransport({ client: { version: "0.0.0", deviceName: "Octave" }, crypto: webCrypto, clock: systemClock });
    await transport.request({
      target: { server, deviceId: "octave-unauthenticated" },
      method: "GET",
      path: "/System/Info/Public",
      timeoutMs: 5_000,
    });
    expect(seen).toEqual([vectors.find((vector) => vector.name === "probe-identity")!.expected]);
  });
});
