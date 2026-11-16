import { createServer } from "node:net";

const DEFAULT_PORT = 1420;

// Parses FLUSTER_E2E_PORT. The run uses this port for the app and the next
// port for the fake-HLS server, so the value stops at 65534.
export function e2ePorts(value) {
  if (value === undefined || value === "") return { app: DEFAULT_PORT, fakeHls: DEFAULT_PORT + 1 };
  const app = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(app) || app < 1024 || app > 65534) {
    throw new Error(
      `FLUSTER_E2E_PORT must be a whole number from 1024 to 65534 (got "${value}"); the run uses that port and the next one.`,
    );
  }
  return { app, fakeHls: app + 1 };
}

// Resolves true when nothing holds the port on 127.0.0.1, which is where Vite binds.
export function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port }, () => server.close(() => resolve(true)));
  });
}

// Returns the first of { app, fakeHls } that is taken, with its role, or null.
export async function firstTakenPort(ports) {
  if (!(await isPortFree(ports.app))) return { port: ports.app, role: "app" };
  if (!(await isPortFree(ports.fakeHls))) return { port: ports.fakeHls, role: "fakeHls" };
  return null;
}

// The one sentence the run stops with, or null when both ports are free.
export function portSentence(ports, taken) {
  if (!taken) return null;
  if (taken.role === "app") {
    return `Port ${taken.port} is taken; the e2e run uses FLUSTER_E2E_PORT (${ports.app}) for the app and the next port (${ports.fakeHls}) for the fake-HLS server. Set FLUSTER_E2E_PORT to a port and its next port that are both free.`;
  }
  return `Port ${taken.port} is taken; the e2e run uses FLUSTER_E2E_PORT (${ports.app}) and the next port (${ports.fakeHls}) for the fake-HLS server. Set FLUSTER_E2E_PORT to a port whose next port is free.`;
}

export async function checkE2ePorts(value) {
  const ports = e2ePorts(value);
  const sentence = portSentence(ports, await firstTakenPort(ports));
  if (sentence) throw new Error(sentence);
  return ports;
}
