import { describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot, PlayerEngine } from "../domain/playback";
import { PlaybackCoordinator, type PlaybackGateway } from "../player/coordinator";
import { failureAction, stopFailureAction } from "../player/session-failure";
import { classifyTransportError } from "../transport-error";
import { JellyfinGateway } from "./gateway";
import { TransportError, type SignInRequest, type SignInResult, type Transport, type TransportRequest, type TransportResponse } from "../ports/transport";
import { webCrypto } from "../adapters/web-crypto";
import { FakeClock } from "../ports/fake-clock";

const CANARY = "CANARY-strip-4d2b8e";
const SERVER = "https://media.test";
const item: LibraryItem = { id: "m1", name: "Fixture", type: "Movie", resumePositionTicks: 0, played: false };
const snapshot: PlaybackSnapshot = {
  positionSeconds: 1,
  paused: false,
  buffering: false,
  volume: 100,
  muted: false,
  tracks: [],
  diagnostics: { decodeMode: "software", decodeLabel: "Software", droppedFrames: 0 },
};

// The TransportError a transport gives for each failure, carrying what a misbehaving adapter (a native bridge, a
// future transport) might attach: the request config with the Authorization header, the request, a response with
// its own copies, and a cause. The gateway rebuilds the error without any of it.
function transportFailure(kind: "401" | "500" | "network" | "timeout"): TransportError {
  const config = {
    url: "/Items",
    headers: { Authorization: `MediaBrowser Client="Octave", Token="${CANARY}"` },
  };
  const request = { responseURL: `${SERVER}/Items?api_key=${CANARY}`, headers: { Authorization: CANARY } };
  const error =
    kind === "401" || kind === "500" ? new TransportError("status", Number(kind)) : new TransportError(kind === "network" ? "network" : "timeout");
  return Object.assign(error, {
    config,
    request,
    response: { status: error.status, statusText: "x", data: {}, headers: { "x-token": CANARY }, config, request },
    cause: new Error(`socket closed for ${CANARY}`),
  });
}

// Every own value and key reachable from the error, with a cycle guard.
function walk(value: unknown, seen = new Set<unknown>(), keys: string[] = [], strings: string[] = []) {
  if (typeof value === "string") strings.push(value);
  if (typeof value !== "object" || value === null || seen.has(value)) return { keys, strings };
  seen.add(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    keys.push(key);
    walk((value as Record<string, unknown>)[key], seen, keys, strings);
  }
  return { keys, strings };
}

function expectStripped(error: unknown, status?: number): void {
  expect(error).toBeInstanceOf(Error);
  const { keys, strings } = walk(error);
  for (const key of ["config", "request", "response", "headers", "cause"]) expect(keys).not.toContain(key);
  expect(strings.join("\n")).not.toContain(CANARY);
  expect(JSON.stringify(error)).not.toContain(CANARY);
  // The axios-shaped response.status is gone; the status is on the error itself.
  expect((error as { status?: number }).status).toBe(status);
}

function signedInTransport(failure: TransportError): Transport {
  return {
    async signIn(_request: SignInRequest): Promise<SignInResult> {
      return { session: "session-1", userId: "user-1", userName: "Louise" };
    },
    async request(_request: TransportRequest): Promise<TransportResponse> {
      throw failure;
    },
    async endSession(): Promise<void> {
      throw failure;
    },
  };
}

function plan(): PlaybackPlan {
  return {
    itemId: "m1",
    title: "Fixture",
    streamUrl: `${SERVER}/Videos/m1/stream?Static=true`,
    mediaSourceId: "s",
    playSessionId: "p1",
    startPositionTicks: 0,
    tracks: [],
    delivery: "static",
    playMethod: "DirectPlay",
    conversionReasons: [],
  };
}

const cases = [
  ["401", 401],
  ["500", 500],
  ["network", undefined],
  ["timeout", undefined],
] as const;

describe("errors leaving a signed-in gateway", () => {
  for (const [kind, status] of cases) {
    it(`carry no token, config, or request for ${kind}`, async () => {
      const gateway = new JellyfinGateway(SERVER, webCrypto, signedInTransport(transportFailure(kind)));
      await gateway.login("Louise", "password");
      const calls: Array<() => Promise<unknown>> = [
        () => gateway.resumeItems(),
        () => gateway.reportStart(plan(), snapshot),
        () => gateway.stopActiveEncoding("p1"),
        () => gateway.createPlaybackPlan(item),
      ];
      for (const call of calls) {
        const error = await call().catch((caught: unknown) => caught);
        expectStripped(error, status);
        if (kind === "network" || kind === "timeout") expect(classifyTransportError(error)).toBe("network");
        if (kind === "500") expect(classifyTransportError(error)).toBe("server");
        if (kind === "401") expect(classifyTransportError(error)).toBe("request");
      }
    });
  }
});

describe("the coordinator PlaybackInfo failure", () => {
  it("carries no token or request internals", async () => {
    const gateway = {
      createPlaybackPlan: vi.fn(async () => { throw transportFailure("500"); }),
      reportStart: vi.fn(),
      reportProgress: vi.fn(),
      reportStopped: vi.fn(),
      stopActiveEncoding: vi.fn(),
    } as unknown as PlaybackGateway;
    const player = {
      subscribe: vi.fn(async () => () => undefined),
      launch: vi.fn(),
      stop: vi.fn(async () => undefined),
    } as unknown as PlayerEngine;
    const coordinator = new PlaybackCoordinator(gateway, player, { onEvent: vi.fn(), onReportingError: vi.fn() }, new FakeClock());
    const error = await coordinator.start(item).catch((caught: unknown) => caught);
    expectStripped(error, 500);
    expect(classifyTransportError(error)).toBe("server");
  });
});

describe("failureAction", () => {
  it("keeps the transport kind and hides the message", () => {
    const action = failureAction(transportFailure("500"));
    expect(action).toEqual({ type: "failure", message: "Jellyfin request failed.", kind: "server" });
  });

  const nativeReason =
    'mpv could not open https://media.test/Videos/x/stream?api_key=SECRET-TOKEN from /home/u/Movies/x.mkv (Token="SECRET-TOKEN")';

  it.each([
    ["string", nativeReason],
    ["Error", new Error(nativeReason)],
  ])("keeps a native %s reason without token, address, or path", (_label, error) => {
    const action = failureAction(error);
    if (action.type !== "failure") throw new Error("expected a failure action");
    expect(action.kind).toBeUndefined();
    expect(action.message).toContain("[path]");
    for (const leak of ["SECRET-TOKEN", "media.test", "api_key", "/home/u", "x.mkv"]) {
      expect(action.message).not.toContain(leak);
    }
  });

  it("gives a failed stop the same message for a string and an Error", () => {
    const fromString = failureAction("The player did not stop.");
    expect(fromString).toEqual({ type: "failure", message: "The player did not stop.", kind: undefined });
    expect(failureAction(new Error("The player did not stop."))).toEqual(fromString);
  });

  it("marks a failed stop with fixed text, so the native reason never reaches the view", () => {
    expect(stopFailureAction()).toEqual({ type: "failure", message: "The player did not stop.", stage: "stop" });
  });
});
