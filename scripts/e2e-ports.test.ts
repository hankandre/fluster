// @vitest-environment node
import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { checkE2ePorts, e2ePorts, firstTakenPort, portSentence } from "./e2e-ports.mjs";

const open: Server[] = [];

function hold(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    open.push(server);
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port }, () => resolve((server.address() as { port: number }).port));
  });
}

async function closeAll(): Promise<void> {
  await Promise.all(open.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
}

// Finds a free port whose next port is also free, by holding an ephemeral one and its neighbour.
async function freePair(): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const first = await hold(0);
    const second = await hold(first + 1).catch(() => 0);
    await closeAll();
    if (second && first < 65534) return first;
  }
  throw new Error("no adjacent free ports");
}

afterEach(closeAll);

describe("e2ePorts", () => {
  it("defaults to 1420 and 1421", () => {
    expect(e2ePorts(undefined)).toEqual({ app: 1420, fakeHls: 1421 });
    expect(e2ePorts("")).toEqual({ app: 1420, fakeHls: 1421 });
  });

  it("uses the value and the next port", () => {
    expect(e2ePorts("43111")).toEqual({ app: 43111, fakeHls: 43112 });
  });

  it.each(["abc", "1.5", "-4", "80", "65535", "70000", "1e4", "0x500"])("rejects %s with a sentence", (value) => {
    expect(() => e2ePorts(value)).toThrow(/^FLUSTER_E2E_PORT must be a whole number from 1024 to 65534/);
  });
});

describe("checkE2ePorts", () => {
  it("passes when both ports are free", async () => {
    const app = await freePair();
    await expect(checkE2ePorts(String(app))).resolves.toEqual({ app, fakeHls: app + 1 });
  });

  it("names the second port when only it is taken", async () => {
    const app = await freePair();
    await hold(app + 1);
    await expect(checkE2ePorts(String(app))).rejects.toThrow(
      `Port ${app + 1} is taken; the e2e run uses FLUSTER_E2E_PORT (${app}) and the next port (${app + 1}) for the fake-HLS server. Set FLUSTER_E2E_PORT to a port whose next port is free.`,
    );
  });

  it("names the first port when it is taken", async () => {
    const app = await freePair();
    await hold(app);
    await expect(checkE2ePorts(String(app))).rejects.toThrow(`Port ${app} is taken; the e2e run uses FLUSTER_E2E_PORT (${app}) for the app`);
  });

  it("reports the first port when both are taken", async () => {
    const app = await freePair();
    await hold(app);
    await hold(app + 1);
    expect(await firstTakenPort({ app, fakeHls: app + 1 })).toEqual({ port: app, role: "app" });
  });

  it("has no sentence when nothing is taken", () => {
    expect(portSentence({ app: 5000, fakeHls: 5001 }, null)).toBeNull();
  });
});
