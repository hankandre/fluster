import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../../domain/catalog";
import type { PlaybackPlan, PlaybackSnapshot, PlayerEngine } from "../../domain/playback";
import { failureAction } from "../../features/player/use-playback-session";
import { PlaybackCoordinator, type PlaybackGateway } from "../player/coordinator";
import { classifyTransportError } from "../transport-error";
import { JellyfinGateway } from "./gateway";
import type { HttpTransport } from "./types";

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

// An AxiosError the way Axios builds it: the config carries the signed-in
// Authorization default header, and the response carries its own copies.
function axiosFailure(kind: "401" | "500" | "network" | "timeout"): AxiosError {
  const config = {
    url: "/Items",
    headers: { Authorization: `MediaBrowser Client="Fluster", Token="${CANARY}"` },
  } as unknown as InternalAxiosRequestConfig;
  const request = { responseURL: `${SERVER}/Items?api_key=${CANARY}`, headers: { Authorization: CANARY } };
  switch (kind) {
    case "401":
    case "500": {
      const status = Number(kind);
      return new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_RESPONSE", config, request, {
        status,
        statusText: "x",
        data: {},
        headers: { "x-token": CANARY },
        config,
        request,
      });
    }
    case "network":
      return new AxiosError("Network Error", "ERR_NETWORK", config, request);
    case "timeout":
      return new AxiosError("timeout of 10000ms exceeded", "ECONNABORTED", config, request);
  }
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
  for (const key of ["config", "request", "headers", "cause"]) expect(keys).not.toContain(key);
  expect(strings.join("\n")).not.toContain(CANARY);
  expect(JSON.stringify(error)).not.toContain(CANARY);
  expect((error as { response?: { status?: number } }).response?.status).toBe(status);
}

function signedInTransport(failure: AxiosError): HttpTransport {
  return {
    async get() { throw failure; },
    async post<T>(url: string) {
      if (url === "/Users/AuthenticateByName") {
        return { data: { AccessToken: CANARY, User: { Id: "user-1", Name: "Louise" } } as T };
      }
      throw failure;
    },
    async delete() { throw failure; },
  };
}

function plan(): PlaybackPlan {
  return {
    itemId: "m1",
    title: "Fixture",
    streamUrl: `${SERVER}/Videos/m1/stream?Static=true`,
    authorization: 'MediaBrowser Client="Fluster"',
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
      const gateway = new JellyfinGateway(SERVER, signedInTransport(axiosFailure(kind)));
      await gateway.login("Louise", "password");
      const calls: Array<() => Promise<unknown>> = [
        () => gateway.latest(),
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
      createPlaybackPlan: vi.fn(async () => { throw axiosFailure("500"); }),
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
    const coordinator = new PlaybackCoordinator(gateway, player, { onEvent: vi.fn(), onReportingError: vi.fn() });
    const error = await coordinator.start(item).catch((caught: unknown) => caught);
    expectStripped(error, 500);
    expect(classifyTransportError(error)).toBe("server");
  });
});

describe("a Query cache error from a gateway call", () => {
  it("holds no token", async () => {
    const gateway = new JellyfinGateway(SERVER, signedInTransport(axiosFailure("401")));
    await gateway.login("Louise", "password");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Probe(): ReactNode {
      useQuery({ queryKey: ["latest"], queryFn: () => gateway.latest() });
      return null;
    }
    render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
    await waitFor(() => expect(client.getQueryState(["latest"])?.status).toBe("error"));
    expectStripped(client.getQueryState(["latest"])?.error, 401);
  });
});

describe("failureAction", () => {
  it("keeps the transport kind and hides the message", () => {
    const action = failureAction(axiosFailure("500"));
    expect(action).toEqual({ type: "failure", message: "Jellyfin request failed.", kind: "server" });
  });
});
