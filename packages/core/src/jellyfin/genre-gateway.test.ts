import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JellyfinGateway } from "./gateway";
import { toItemDetail } from "./item-detail";
import type { BaseItemDto, HttpRequestConfig, HttpResponse, HttpTransport } from "./types";
import { webCrypto } from "../adapters/web-crypto";

// Genre browsing's requests, answered by the P16-01 fixtures of both pinned servers.
const fixtureRoot = join(__dirname, "../../tests/fixtures/jellyfin");
const versions = ["10.11.7", "12.4.0"] as const;
const load = (version: string, name: string): unknown => JSON.parse(readFileSync(join(fixtureRoot, version, `${name}.json`), "utf8"));

interface Call {
  url: string;
  params?: Record<string, unknown>;
}

class FixtureTransport implements HttpTransport {
  calls: Call[] = [];
  answers = new Map<string, unknown>();

  async get<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.calls.push({ url, params: config?.params });
    return { data: this.answers.get(url) as T, status: 200 };
  }

  async post<T>(url: string): Promise<HttpResponse<T>> {
    if (url === "/Users/AuthenticateByName") {
      return { data: { AccessToken: "top-secret", User: { Id: "user-1", Name: "Louise" } } as T, status: 200 };
    }
    throw new Error(`unexpected POST ${url}`);
  }

  async delete<T>(): Promise<HttpResponse<T>> {
    throw new Error("unexpected DELETE");
  }
}

async function signedIn() {
  const transport = new FixtureTransport();
  const gateway = new JellyfinGateway("https://media.test", webCrypto, transport, "install-1");
  await gateway.login("Louise", "password");
  transport.calls = [];
  return { gateway, transport };
}

const page = { itemTypes: ["Movie", "Series"] as ("Movie" | "Series")[], startIndex: 0, limit: 60, sortBy: "SortName" as const, sortOrder: "Ascending" as const, filters: [] };

describe.each(versions)("Genre calls, Jellyfin %s", (version) => {
  it("lists a library's genres with only the user and the library", async () => {
    const { gateway, transport } = await signedIn();
    transport.answers.set("/Genres", load(version, "discovery-genres-movies"));
    const genres = await gateway.libraryGenres("lib-1");
    expect(transport.calls).toEqual([{ url: "/Genres", params: { userId: "user-1", parentId: "lib-1" } }]);
    expect(genres.map((genre) => genre.name)).toEqual(["Comedy", "Documentary", "Drama", "Mystery", "Science Fiction"]);
    expect(genres.map((genre) => genre.id)).toContain("genre-mystery");
  });

  it("maps no genres to an empty list", async () => {
    const { gateway, transport } = await signedIn();
    transport.answers.set("/Genres", { Items: [] });
    expect(await gateway.libraryGenres("lib-1")).toEqual([]);
  });

  it("sends genreIds with the library query and gets that genre's titles", async () => {
    const { gateway, transport } = await signedIn();
    transport.answers.set("/Items", load(version, "discovery-items-by-genre"));
    const result = await gateway.libraryItems("lib-1", { ...page, genreId: "genre-mystery" });
    expect(transport.calls[0]?.params).toMatchObject({ parentId: "lib-1", genreIds: "genre-mystery", recursive: true, includeItemTypes: "Movie,Series" });
    expect(result.cards.map((card) => card.title)).toEqual(["Synthetic ASS (2024)", "Synthetic H264 (2024)"]);
  });

  it("sends no genreIds without a genre", async () => {
    const { gateway, transport } = await signedIn();
    transport.answers.set("/Items", { Items: [] });
    await gateway.libraryItems("lib-1", page);
    expect(transport.calls[0]?.params).not.toHaveProperty("genreIds");
  });

  it("maps GenreItems and ParentId on an item", () => {
    const detail = toItemDetail(load(version, "item-detail-no-fields-multitrack") as BaseItemDto)!;
    expect(detail.genreItems).toEqual([{ id: "id-5", name: "Comedy" }]);
    expect(detail.parentId).toBe("id-3");
  });
});
