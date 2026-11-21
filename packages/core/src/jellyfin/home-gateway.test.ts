import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { continueWatchingRow } from "../../domain/up-next";
import { HOME_ROW_LIMIT, JellyfinGateway } from "./gateway";
import type { HttpRequestConfig, HttpResponse, HttpTransport } from "./types";

// Home's discovery requests, answered by the P16-01 and P16-02 fixtures of both pinned servers.
const fixtureRoot = join(__dirname, "../../../tests/fixtures/jellyfin");
const versions = ["10.11.7", "12.4.0"] as const;
const load = (version: string, name: string): unknown => JSON.parse(readFileSync(join(fixtureRoot, version, `discovery-${name}.json`), "utf8"));

interface Call {
  url: string;
  params?: Record<string, unknown>;
}

class FixtureTransport implements HttpTransport {
  calls: Call[] = [];
  answers = new Map<string, unknown>();
  failures = new Map<string, number>();

  async get<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.calls.push({ url, params: config?.params });
    const status = this.failures.get(url);
    if (status) throw Object.assign(new Error(`Request failed with status code ${status}`), { response: { status } });
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
  const gateway = new JellyfinGateway("https://media.test", transport, "install-1");
  await gateway.login("Louise", "password");
  transport.calls = [];
  return { gateway, transport };
}

describe.each(versions)("Home gateway calls, Jellyfin %s", (version) => {
  it("sends Next Up with enableResumable=false, DateCreated, and no nextUpDateCutoff", async () => {
    const { gateway, transport } = await signedIn();
    transport.answers.set("/Shows/NextUp", load(version, "nextup-resumable-false"));
    await gateway.nextUp();
    expect(transport.calls).toHaveLength(1);
    const params = transport.calls[0]?.params ?? {};
    expect(params).toMatchObject({ userId: "user-1", limit: HOME_ROW_LIMIT, enableRewatching: false, enableResumable: false, fields: "PrimaryImageAspectRatio,DateCreated" });
    expect(params).not.toHaveProperty("nextUpDateCutoff");
  });

  it("maps the new episode with its date added and series id, and Home keeps it past the window", async () => {
    const { gateway, transport } = await signedIn();
    transport.answers.set("/Shows/NextUp", load(version, "nextup-new-episode-no-cutoff"));
    const cards = await gateway.nextUp();
    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    expect(card.seriesId).toBe("series-synthetic");
    expect(card.addedAt).toBeTruthy();
    // The series was finished long ago; the episode arrived inside 14 days of `now`.
    const plays = { entries: [{ id: "item-episode-2", kind: "Episode" as const, seriesId: "series-synthetic", playedAt: "2026-01-05T12:00:00Z" }], complete: true };
    const arrived = Date.parse(card.addedAt!);
    const row = (now: number) => continueWatchingRow({ resume: [], nextUp: cards, plays, window: "14", now }).row;
    expect(row(arrived + 5 * 86_400_000)).toHaveLength(1);
    expect(row(arrived + 15 * 86_400_000)).toHaveLength(0);
  });

  it("asks for Resume with user data and maps the last play date", async () => {
    const { gateway, transport } = await signedIn();
    transport.answers.set("/UserItems/Resume", load(version, "resume-old-and-recent"));
    const cards = await gateway.resumeItems();
    expect(transport.calls[0]?.params).toMatchObject({ mediaTypes: "Video", limit: HOME_ROW_LIMIT, enableUserData: true });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => card.lastPlayedAt !== undefined)).toBe(true);
  });

  it("lists recently played films and episodes, newest first, with no images", async () => {
    const { gateway, transport } = await signedIn();
    transport.answers.set("/Items", load(version, "recently-played"));
    const plays = await gateway.recentlyPlayed();
    expect(transport.calls[0]).toEqual({
      url: "/Items",
      params: {
        userId: "user-1",
        recursive: true,
        includeItemTypes: "Movie,Episode",
        filters: "IsPlayed",
        sortBy: "DatePlayed",
        sortOrder: "Descending",
        limit: 100,
        enableUserData: true,
        enableImages: false,
        enableTotalRecordCount: false,
      },
    });
    expect(plays.complete).toBe(true);
    expect(plays.entries.map((e) => [e.id.startsWith("item-") || e.id.startsWith("id-"), e.kind])).toEqual([[true, "Episode"], [true, "Movie"], [true, "Movie"]]);
    expect(plays.entries[0]?.seriesId).toBe("series-synthetic");
    expect(plays.entries.map((e) => e.playedAt.slice(0, 10))).toEqual(["2026-06-03", "2026-06-02", "2026-01-05"]);
  });

  it("marks a recently-played list as incomplete when the server filled the limit", async () => {
    const { gateway, transport } = await signedIn();
    const items = Array.from({ length: 100 }, (_, i) => ({ Id: `m${i}`, Name: `m${i}`, Type: "Movie", UserData: { LastPlayedDate: `2026-06-01T00:00:${String(i % 60).padStart(2, "0")}Z` } }));
    transport.answers.set("/Items", { Items: items });
    expect((await gateway.recentlyPlayed()).complete).toBe(false);
  });

  it("asks for similar titles with user data and keeps watched ones for the caller to drop", async () => {
    const { gateway, transport } = await signedIn();
    transport.answers.set("/Items/item-h264/Similar", load(version, "similar-movie"));
    const cards = await gateway.similarItems("item-h264");
    expect(transport.calls[0]).toMatchObject({ url: "/Items/item-h264/Similar", params: { userId: "user-1", limit: 12, enableUserData: true, enableTotalRecordCount: false } });
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards.every((card) => card.kind === "Movie")).toBe(true);
  });

  it("asks for similar titles of a series and gets none", async () => {
    const { gateway, transport } = await signedIn();
    transport.answers.set("/Items/series-synthetic/Similar", load(version, "similar-series"));
    await expect(gateway.similarItems("series-synthetic")).resolves.toEqual([]);
  });

  it(version === "10.11.7" ? "reports a 404 from Collections as undefined" : "lists the collection of a member and none for a non-member", async () => {
    const { gateway, transport } = await signedIn();
    if (version === "10.11.7") {
      transport.failures.set("/Items/item-h264/Collections", 404);
      await expect(gateway.itemCollections("item-h264")).resolves.toBeUndefined();
      return;
    }
    transport.answers.set("/Items/item-h264/Collections", load(version, "item-collections-member"));
    transport.answers.set("/Items/item-multitrack/Collections", load(version, "item-collections-non-member"));
    const member = await gateway.itemCollections("item-h264");
    expect(member?.map((c) => [c.id, c.kind])).toEqual([["collection-synthetic", "BoxSet"]]);
    await expect(gateway.itemCollections("item-multitrack")).resolves.toEqual([]);
  });

  it("passes other Collections failures through", async () => {
    const { gateway, transport } = await signedIn();
    transport.failures.set("/Items/x/Collections", 500);
    await expect(gateway.itemCollections("x")).rejects.toThrow("status code 500");
  });

  it("lists a collection's members in release order", async () => {
    const { gateway, transport } = await signedIn();
    transport.answers.set("/Items", load(version, "collection-items"));
    const cards = await gateway.collectionItems("collection-synthetic");
    expect(transport.calls[0]).toMatchObject({
      url: "/Items",
      params: { userId: "user-1", parentId: "collection-synthetic", sortBy: "PremiereDate,ProductionYear,SortName", sortOrder: "Ascending", enableUserData: true },
    });
    expect(cards.map((c) => c.title).sort()).toEqual(["Synthetic AV1 (2024)", "Synthetic H264 (2024)"]);
  });

  it("makes no write call while Home's sources load", async () => {
    const { gateway, transport } = await signedIn();
    transport.answers.set("/UserItems/Resume", load(version, "resume-mixed"));
    transport.answers.set("/Shows/NextUp", load(version, "nextup-resumable-false"));
    transport.answers.set("/Items", load(version, "recently-played"));
    await Promise.all([gateway.resumeItems(), gateway.nextUp(), gateway.recentlyPlayed()]);
    expect(transport.calls.map((c) => c.url).sort()).toEqual(["/Items", "/Shows/NextUp", "/UserItems/Resume"]);
  });
});
