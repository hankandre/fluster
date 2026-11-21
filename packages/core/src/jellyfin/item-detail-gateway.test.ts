import { describe, expect, it } from "vitest";
import { ItemNotFoundError } from "../domain/catalog";
import { JellyfinGateway } from "./gateway";
import { TransportError } from "../ports/transport";
import type { SignInRequest, SignInResult, Transport, TransportRequest, TransportResponse } from "../ports/transport";
import { toQuery } from "./query";
import { webCrypto } from "../adapters/web-crypto";

interface Call {
  method: "GET" | "POST" | "DELETE";
  url: string;
  query: readonly (readonly [string, string])[];
  config: { signal?: AbortSignal; timeout: number };
}

class RecordingTransport implements Transport {
  calls: Call[] = [];
  responses = new Map<string, unknown>();

  async signIn(_request: SignInRequest): Promise<SignInResult> {
    return { session: "session-1", userId: "user-1", userName: "Louise" };
  }

  async request(request: TransportRequest): Promise<TransportResponse> {
    this.calls.push({ method: request.method, url: request.path, query: request.query ?? [], config: { signal: request.signal, timeout: request.timeoutMs } });
    if (request.method === "GET") return { status: 200, body: this.responses.get(`GET ${request.path}`) };
    return { status: 204, body: undefined };
  }

  async endSession(): Promise<void> {}
}

async function signedIn() {
  const transport = new RecordingTransport();
  const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
  await gateway.login("Louise", "password");
  transport.calls = [];
  return { gateway, transport };
}

describe("item detail gateway calls", () => {
  it("reads GET /Items/{id} with only the user id and maps the item", async () => {
    const { gateway, transport } = await signedIn();
    transport.responses.set("GET /Items/movie%2F1", { Id: "movie/1", Name: "Film", Type: "Movie", MediaSources: [{ Id: "s1", Name: "1080p" }] });
    const signal = new AbortController().signal;
    const detail = await gateway.itemDetail("movie/1", signal);
    expect(detail.versions).toEqual([{ id: "s1", name: "1080p", audio: [], subtitles: [] }]);
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]).toMatchObject({ method: "GET", url: "/Items/movie%2F1", config: { signal } });
    expect(transport.calls[0].query).toEqual(toQuery({ userId: "user-1" }));
  });

  it("maps person images and both ratings from the full item", async () => {
    const { gateway, transport } = await signedIn();
    transport.responses.set("GET /Items/movie%2F1", {
      Id: "movie/1",
      Name: "Film",
      Type: "Movie",
      CommunityRating: 7.8,
      CriticRating: 91,
      People: [
        { Id: "p1", Name: "Amy Adams", Type: "Actor", PrimaryImageTag: "t1" },
        { Id: "p2", Name: "Cher", Type: "Actor" },
      ],
    });
    const detail = await gateway.itemDetail("movie/1");
    expect(detail.communityRating).toBe(7.8);
    expect(detail.criticRating).toBe(91);
    expect(detail.cast).toEqual([
      { name: "Amy Adams", image: { itemId: "p1", type: "Primary", tag: "t1" } },
      { name: "Cher" },
    ]);
  });

  it("reports a 404 as ItemNotFoundError and passes other failures through", async () => {
    const { gateway, transport } = await signedIn();
    transport.request = async () => ({ status: 404, body: undefined });
    await expect(gateway.itemDetail("gone")).rejects.toBeInstanceOf(ItemNotFoundError);
    transport.request = async () => ({ status: 500, body: undefined });
    await expect(gateway.itemDetail("broken")).rejects.toMatchObject({ code: "status", status: 500 });
    transport.request = async () => {
      throw new TransportError("network");
    };
    await expect(gateway.itemDetail("offline")).rejects.toMatchObject({ code: "network" });
  });

  it("rejects an item without an ID or name", async () => {
    const { gateway, transport } = await signedIn();
    transport.responses.set("GET /Items/x", {});
    await expect(gateway.itemDetail("x")).rejects.toThrow("without an ID or name");
  });

  it.each([
    ["setPlayed", true, "POST", "/UserPlayedItems/i%2F1"],
    ["setPlayed", false, "DELETE", "/UserPlayedItems/i%2F1"],
    ["setFavorite", true, "POST", "/UserFavoriteItems/i%2F1"],
    ["setFavorite", false, "DELETE", "/UserFavoriteItems/i%2F1"],
  ] as const)("%s(%s) sends %s %s", async (name, value, method, url) => {
    const { gateway, transport } = await signedIn();
    await gateway[name]("i/1", value);
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]).toMatchObject({ method, url, query: [["userId", "user-1"]] });
  });

  it("requires a session", async () => {
    const gateway = new JellyfinGateway("https://media.test", webCrypto, new RecordingTransport(), "install-1");
    await expect(gateway.setFavorite("i", true)).rejects.toThrow("Sign in");
    await expect(gateway.itemDetail("i")).rejects.toThrow("Sign in");
  });
});
