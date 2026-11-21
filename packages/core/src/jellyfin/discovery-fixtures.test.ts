import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Replays the discovery fixtures (P16-01) recorded by tests/integration/record-discovery-fixtures.mjs.
// These tests assert what the two pinned servers answered; docs/research/discovery-api.md states the
// same facts in the same words. Never edit a fixture to fit a test: record it again.
const fixtureRoot = join(__dirname, "../../tests/fixtures/jellyfin");
const versions = ["10.11.7", "12.4.0"] as const;

// The wire fields these tests read. packages/core/src/jellyfin/types.ts gains them with the gateway tasks.
interface WireUserData {
  Played?: boolean;
  PlayCount?: number;
  PlaybackPositionTicks?: number;
  LastPlayedDate?: string;
}
interface WireItem {
  Id: string;
  Name: string;
  Type?: string;
  ExtraType?: string;
  DateCreated?: string;
  UserData?: WireUserData;
}
interface WireList {
  Items: WireItem[];
  TotalRecordCount?: number;
}
interface WireStep {
  step: string;
  request: { method: string; path: string };
  status: number;
  response: WireItem & WireUserData & { UserData?: WireUserData; Items?: WireItem[] };
}
interface WireCategory {
  RecommendationType: string;
  BaselineItemName: string;
  Items: WireItem[];
}

const fixtureFiles = [
  "similar-movie",
  "similar-series",
  "suggestions",
  "movie-recommendations",
  "genres-movies",
  "persons",
  "local-trailers",
  "special-features",
  "filters2-movies",
  "items-by-genre",
  "items-by-person",
  "resume-mixed",
  "nextup-resumable-true",
  "nextup-resumable-false",
  "resume-old-and-recent",
  "nextup-no-cutoff",
  "nextup-cutoff-mid",
  "nextup-cutoff-early",
  "nextup-caught-up",
  "nextup-new-episode-no-cutoff",
  "nextup-new-episode-cutoff-mid",
  "userdata-reset-sequence",
  "item-collections-member",
  "item-collections-non-member",
  "collection-items",
  "openapi-date-params",
  "recently-played",
];

function path(version: string, name: string): string {
  return join(fixtureRoot, version, `discovery-${name}.json`);
}
function load<T>(version: string, name: string): T {
  return JSON.parse(readFileSync(path(version, name), "utf8")) as T;
}
const names = (list: WireList | WireItem[]): string[] => (Array.isArray(list) ? list : list.Items).map((i) => i.Name);

describe.each(versions)("discovery fixtures, Jellyfin %s", (version) => {
  it("has every fixture, and each one parses", () => {
    expect(fixtureFiles).toHaveLength(27);
    for (const name of fixtureFiles) {
      expect(existsSync(path(version, name)), `${version}/discovery-${name}.json`).toBe(true);
      expect(() => load(version, name)).not.toThrow();
    }
  });

  describe("scrubbing", () => {
    const files = readdirSync(join(fixtureRoot, version)).filter((f) => f.startsWith("discovery-"));
    const fakeUsers = new Set(["user-discovery", "user-test"]);
    const fakeServers = new Set(["server-1011", "server-124"]);

    it.each(files)("%s holds no real id, host, token, or user", (file) => {
      const text = readFileSync(join(fixtureRoot, version, file), "utf8");
      expect(text).not.toMatch(/\b[0-9a-f]{32}\b/i);
      expect(text).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
      // The servers' own address. Provider links (imdb, themoviedb) are real data and stay.
      expect(text).not.toMatch(/127\.0\.0\.1|localhost|:1809[67]\b/);
      expect(text).not.toMatch(/https?:\/\/\d{1,3}(?:\.\d{1,3}){3}\b/);
      for (const match of text.matchAll(/(?:ApiKey|api_key|AccessToken|Token)=([^&"\s]*)/g)) {
        expect(match[1]).toBe("REDACTED");
      }
      for (const match of text.matchAll(/"UserId":\s*"([^"]*)"/g)) expect(fakeUsers.has(match[1] ?? "")).toBe(true);
      for (const match of text.matchAll(/"ServerId":\s*"([^"]*)"/g)) expect(fakeServers.has(match[1] ?? "")).toBe(true);
    });
  });

  describe("static routes", () => {
    it("Similar for the H.264 movie lists other synthetic movies and never itself", () => {
      const list = load<WireList>(version, "similar-movie");
      expect(list.Items.length).toBeGreaterThanOrEqual(3);
      expect(names(list)).not.toContain("Synthetic H264 (2024)");
      expect(list.Items.every((i) => i.Type === "Movie")).toBe(true);
    });

    it("Similar for the series lists nothing", () => {
      expect(load<WireList>(version, "similar-series").Items).toEqual([]);
    });

    it("Suggestions lists ten movies and series, watched ones included, with UserData", () => {
      const list = load<WireList>(version, "suggestions");
      expect(list.Items).toHaveLength(10);
      expect(list.Items.every((i) => i.Type === "Movie" || i.Type === "Series")).toBe(true);
      const watched = list.Items.find((i) => i.Name === "Synthetic H264 (2024)");
      expect(watched?.UserData?.Played).toBe(true);
    });

    it("Movies/Recommendations returns categories as a bare array", () => {
      const categories = load<WireCategory[]>(version, "movie-recommendations");
      expect(Array.isArray(categories)).toBe(true);
      const types = categories.map((c) => c.RecommendationType);
      expect(types).toContain("SimilarToRecentlyPlayed");
      expect(categories.find((c) => c.RecommendationType === "SimilarToRecentlyPlayed")?.BaselineItemName).toBe("Synthetic H264 (2024)");
    });

    it(version === "10.11.7" ? "Movies/Recommendations has only the similar-to-recently-played category on 10.11.7" : "Movies/Recommendations adds actor categories on 12.4.0", () => {
      const types = load<WireCategory[]>(version, "movie-recommendations").map((c) => c.RecommendationType);
      if (version === "10.11.7") expect(types).toEqual(["SimilarToRecentlyPlayed"]);
      else expect(types).toEqual(["SimilarToRecentlyPlayed", "HasActorFromRecentlyPlayed", "HasActorFromRecentlyPlayed"]);
    });

    it("Genres lists the NFO genres as Genre items", () => {
      const list = load<WireList>(version, "genres-movies");
      expect(names(list)).toEqual(expect.arrayContaining(["Comedy", "Drama", "Mystery", "Science Fiction"]));
      expect(list.Items.every((i) => i.Type === "Genre")).toBe(true);
    });

    it("Persons lists the NFO people as Person items", () => {
      const list = load<WireList>(version, "persons");
      expect(names(list)).toEqual(expect.arrayContaining(["Ada Placeholder", "Bo Example", "Cy Sample"]));
      expect(list.Items.every((i) => i.Type === "Person")).toBe(true);
    });

    it("LocalTrailers is a bare array holding one item of type Trailer", () => {
      const trailers = load<WireItem[]>(version, "local-trailers");
      expect(Array.isArray(trailers)).toBe(true);
      expect(trailers).toHaveLength(1);
      expect(trailers[0]?.Type).toBe("Trailer");
      expect(trailers[0]?.ExtraType).toBe("Trailer");
    });

    it("the local trailer is named after the file on 10.11.7 and plain Trailer on 12.4.0", () => {
      const name = load<WireItem[]>(version, "local-trailers")[0]?.Name;
      expect(name).toBe(version === "10.11.7" ? "Synthetic Extras (2024)-trailer" : "Trailer");
    });

    it("SpecialFeatures is a bare array holding the featurette", () => {
      const features = load<WireItem[]>(version, "special-features");
      expect(Array.isArray(features)).toBe(true);
      expect(features).toHaveLength(1);
      expect(features[0]?.Name).toBe("Synthetic Extras Featurette");
      expect(features[0]?.ExtraType).toBe("Featurette");
    });

    it(version === "10.11.7" ? "Filters2 lists genres and tags only on 10.11.7" : "Filters2 also lists audio and subtitle languages on 12.4.0", () => {
      const filters = load<Record<string, unknown>>(version, "filters2-movies");
      const genres = (filters.Genres as { Name: string }[]).map((g) => g.Name);
      expect(genres).toEqual(["Comedy", "Documentary", "Drama", "Mystery", "Science Fiction"]);
      if (version === "10.11.7") expect(Object.keys(filters).sort()).toEqual(["Genres", "Tags"]);
      else expect(Object.keys(filters).sort()).toEqual(["AudioLanguages", "Genres", "SubtitleLanguages", "Tags"]);
    });

    it("Items filtered by genreIds holds exactly the movies whose NFO names that genre", () => {
      expect(names(load<WireList>(version, "items-by-genre")).sort()).toEqual(["Synthetic ASS (2024)", "Synthetic H264 (2024)"]);
    });

    it("Items filtered by personIds holds exactly the movies and the series that name that person", () => {
      expect(names(load<WireList>(version, "items-by-person")).sort()).toEqual([
        "Synthetic AV1 (2024)",
        "Synthetic Extras (2024)",
        "Synthetic H264 (2024)",
        "Synthetic Show",
      ]);
    });
  });

  describe("ordering Resume and Next Up by last play", () => {
    it("Resume items carry UserData.LastPlayedDate", () => {
      const list = load<WireList>(version, "resume-mixed");
      expect(list.Items).toHaveLength(3);
      expect(list.Items.every((i) => typeof i.UserData?.LastPlayedDate === "string")).toBe(true);
    });

    it("Resume lists movies and episodes together, newest last play first", () => {
      const list = load<WireList>(version, "resume-mixed");
      expect(names(list)).toEqual(["Synthetic Show S01E02", "Synthetic ASS (2024)", "Synthetic Multitrack (2024)"]);
      const dates = list.Items.map((i) => Date.parse(i.UserData?.LastPlayedDate ?? ""));
      expect(dates).toEqual([...dates].sort((a, b) => b - a));
    });

    it("Next Up with enableResumable=true holds the in-progress episode, with its own LastPlayedDate", () => {
      const list = load<WireList>(version, "nextup-resumable-true");
      expect(names(list)).toEqual(["Synthetic Show S01E02"]);
      expect(list.Items[0]?.UserData?.LastPlayedDate).toBe("2026-06-03T13:00:00.0000000Z");
    });

    it("Next Up with enableResumable=false leaves the in-progress episode out", () => {
      expect(load<WireList>(version, "nextup-resumable-false").Items).toEqual([]);
    });

    it("an unplayed next episode carries no LastPlayedDate", () => {
      const list = load<WireList>(version, "nextup-no-cutoff");
      expect(names(list)).toEqual(["Synthetic Show S01E02"]);
      expect(list.Items[0]?.UserData?.LastPlayedDate).toBeUndefined();
    });

    it("the two lists can be ordered by last play only for in-progress items", () => {
      // Resume always carries the date; Next Up carries it only when the episode is in progress,
      // and then Resume already lists that episode. An unplayed next episode has no date of its own.
      const resume = load<WireList>(version, "resume-mixed");
      const nextUp = load<WireList>(version, "nextup-no-cutoff");
      expect(resume.Items.every((i) => i.UserData?.LastPlayedDate)).toBe(true);
      expect(nextUp.Items.some((i) => !i.UserData?.LastPlayedDate)).toBe(true);
    });
  });

  describe("leaving out old items", () => {
    it("Resume takes no date parameter", () => {
      const params = load<Record<string, string[]>>(version, "openapi-date-params")["GET /UserItems/Resume"] ?? [];
      expect(params.length).toBeGreaterThan(5);
      expect(params.filter((p) => /date|cutoff|since|after|before/i.test(p))).toEqual([]);
    });

    it("Next Up takes nextUpDateCutoff as its only date parameter", () => {
      const params = load<Record<string, string[]>>(version, "openapi-date-params")["GET /Shows/NextUp"] ?? [];
      expect(params.filter((p) => /date|cutoff|since|after|before/i.test(p))).toEqual(["nextUpDateCutoff"]);
    });

    it("Resume lists an item last played long ago, so the client filters it", () => {
      const list = load<WireList>(version, "resume-old-and-recent");
      expect(names(list)).toEqual(["Synthetic ASS (2024)", "Synthetic Multitrack (2024)"]);
      expect(list.Items[1]?.UserData?.LastPlayedDate).toBe("2026-01-05T12:00:00.0000000Z");
    });

    it("Next Up with no cutoff lists the next episode of a series last played in January", () => {
      expect(names(load<WireList>(version, "nextup-no-cutoff"))).toEqual(["Synthetic Show S01E02"]);
    });

    it("a cutoff after the series' last play leaves the series out", () => {
      expect(load<WireList>(version, "nextup-cutoff-mid").Items).toEqual([]);
    });

    it("a cutoff before the series' last play keeps the series", () => {
      expect(names(load<WireList>(version, "nextup-cutoff-early"))).toEqual(["Synthetic Show S01E02"]);
    });

    it("a caught-up series is not in Next Up", () => {
      expect(load<WireList>(version, "nextup-caught-up").Items).toEqual([]);
    });

    it("a new episode brings a caught-up series back when there is no cutoff", () => {
      const list = load<WireList>(version, "nextup-new-episode-no-cutoff");
      expect(names(list)).toEqual(["Synthetic Show S01E03"]);
    });

    it("a new episode created after the cutoff does not bring the series back under that cutoff", () => {
      const created = load<WireList>(version, "nextup-new-episode-no-cutoff").Items[0]?.DateCreated ?? "";
      expect(Date.parse(created)).toBeGreaterThan(Date.parse("2026-03-01T00:00:00Z"));
      expect(load<WireList>(version, "nextup-new-episode-cutoff-mid").Items).toEqual([]);
    });
  });

  describe("resetting a position", () => {
    const steps = () => load<{ steps: WireStep[] }>(version, "userdata-reset-sequence").steps;
    const find = (label: string) => {
      const step = steps().find((s) => s.step === label);
      if (!step) throw new Error(`no step ${label}`);
      return step;
    };

    it("a zero-position POST answers 200 with the new UserData", () => {
      for (const label of ["never played: POST zero position", "previously played: POST zero position"]) {
        const step = find(label);
        expect(step.request.method).toBe("POST");
        expect(step.status).toBe(200);
        expect(step.response.PlaybackPositionTicks).toBe(0);
      }
    });

    it("a zero position takes a never-played item out of Resume", () => {
      const before = find("never played, in progress, before: read Resume").response.Items ?? [];
      const after = find("never played, after: read Resume").response.Items ?? [];
      expect(before.map((i) => i.Name)).toEqual(["Synthetic Multitrack (2024)"]);
      expect(after).toEqual([]);
    });

    it("a zero position leaves Played false, PlayCount 0, and LastPlayedDate unchanged on a never-played item", () => {
      const before = find("never played, in progress, before: read item").response.UserData;
      const after = find("never played, after: read item").response.UserData;
      expect(before?.PlaybackPositionTicks).toBeGreaterThan(0);
      expect(after?.PlaybackPositionTicks).toBe(0);
      expect(after?.Played).toBe(false);
      expect(after?.PlayCount).toBe(0);
      expect(after?.LastPlayedDate).toBe(before?.LastPlayedDate);
    });

    it("a zero position takes a previously played item out of Resume and keeps its PlayCount and LastPlayedDate", () => {
      const before = find("previously played, in progress, before: read item").response.UserData;
      const after = find("previously played, after: read item").response.UserData;
      expect(find("previously played, in progress, before: read Resume").response.Items?.map((i) => i.Name)).toEqual(["Synthetic AV1 (2024)"]);
      expect(find("previously played, after: read Resume").response.Items).toEqual([]);
      expect(after?.PlaybackPositionTicks).toBe(0);
      expect(after?.Played).toBe(false);
      expect(after?.PlayCount).toBe(1);
      expect(after?.LastPlayedDate).toBe(before?.LastPlayedDate);
    });
  });

  describe("collections", () => {
    const member = () => load<{ httpStatus?: number } | WireList>(version, "item-collections-member");
    const nonMember = () => load<{ httpStatus?: number } | WireList>(version, "item-collections-non-member");

    it(version === "10.11.7" ? "GET /Items/{itemId}/Collections answers 404 on 10.11.7" : "GET /Items/{itemId}/Collections lists the collection on 12.4.0", () => {
      if (version === "10.11.7") {
        expect(member()).toEqual({ httpStatus: 404 });
        expect(nonMember()).toEqual({ httpStatus: 404 });
        return;
      }
      expect((member() as WireList).Items.map((i) => [i.Id, i.Type])).toEqual([["collection-synthetic", "BoxSet"]]);
      expect((nonMember() as WireList).Items).toEqual([]);
    });

    it("Items with the collection as parentId lists its members on both versions", () => {
      expect(names(load<WireList>(version, "collection-items")).sort()).toEqual(["Synthetic AV1 (2024)", "Synthetic H264 (2024)"]);
    });
  });

  describe("recently played", () => {
    it("GET /Items sorted by DatePlayed lists finished films and episodes newest first, without the in-progress film", () => {
      const list = load<WireList & { Items: (WireItem & { SeriesId?: string })[] }>(version, "recently-played");
      expect(names(list)).toEqual(["Synthetic Show S01E01", "Synthetic ASS (2024)", "Synthetic H264 (2024)"]);
      expect(list.Items.map((i) => i.UserData?.LastPlayedDate?.slice(0, 10))).toEqual(["2026-06-03", "2026-06-02", "2026-01-05"]);
      expect(list.Items.every((i) => i.UserData?.Played === true)).toBe(true);
      expect(list.Items[0]?.SeriesId).toBe("series-synthetic");
      expect(names(list)).not.toContain("Synthetic Multitrack (2024)");
    });
  });
});
