import { describe, expect, it } from "vitest";
import { JellyfinGateway } from "./gateway";
import type { HttpRequestConfig, HttpResponse, HttpTransport } from "./types";

interface Call {
  method: "GET" | "POST" | "DELETE";
  url: string;
  config?: HttpRequestConfig;
}

class RecordingTransport implements HttpTransport {
  calls: Call[] = [];
  responses = new Map<string, unknown>();

  async get<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.calls.push({ method: "GET", url, config });
    return { data: this.responses.get(`GET ${url}`) as T, status: 200 };
  }

  async post<T>(url: string, _data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.calls.push({ method: "POST", url, config });
    if (url === "/Users/AuthenticateByName") {
      return { data: { AccessToken: "top-secret", User: { Id: "user-1", Name: "Louise" } } as T, status: 200 };
    }
    return { data: undefined as T, status: 204 };
  }

  async delete<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.calls.push({ method: "DELETE", url, config });
    return { data: undefined as T, status: 204 };
  }
}

async function signedIn() {
  const transport = new RecordingTransport();
  const gateway = new JellyfinGateway("https://media.test", transport, "install-1");
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
    expect(transport.calls[0]).toMatchObject({ method: "GET", url: "/Items/movie%2F1", config: { params: { userId: "user-1" }, signal } });
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
    expect(transport.calls[0]).toMatchObject({ method, url, config: { params: { userId: "user-1" } } });
  });

  it("requires a session", async () => {
    const gateway = new JellyfinGateway("https://media.test", new RecordingTransport(), "install-1");
    await expect(gateway.setFavorite("i", true)).rejects.toThrow("Sign in");
    await expect(gateway.itemDetail("i")).rejects.toThrow("Sign in");
  });
});
