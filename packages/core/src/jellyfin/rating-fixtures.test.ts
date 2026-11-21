import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toBrowseCards } from "./cards";
import type { BaseItemDto } from "./types";

// Replays the personal-rating fixtures (P16-13) recorded by tests/integration/record-rating-fixtures.mjs.
// These tests assert what the two pinned servers answered; packages/core/tests/fixtures/jellyfin/README.md states the
// same facts in the same words. Never edit a fixture to fit a test: record it again.
const fixtureRoot = join(__dirname, "../../tests/fixtures/jellyfin");
const versions = ["10.11.7", "12.4.0"] as const;

interface WireUserData {
  Rating?: number;
  Likes?: boolean;
  Played?: boolean;
  PlayCount?: number;
  PlaybackPositionTicks?: number;
  LastPlayedDate?: string;
  IsFavorite?: boolean;
}
interface WireStep {
  step: string;
  request: { method: string; path: string; query?: Record<string, unknown>; body?: unknown };
  status: number;
  response: WireUserData | null;
  readBack: { Id: string; Name: string; UserData?: WireUserData };
}
interface WireItem {
  Id: string;
  Name: string;
  ProductionYear?: number;
  ImageTags?: Record<string, string>;
  PrimaryImageAspectRatio?: number;
  UserData?: WireUserData;
}
interface WireList {
  httpStatus?: number;
  Items: WireItem[];
  TotalRecordCount: number;
  StartIndex: number;
  setup?: { film: string; action: string }[];
}

const files = [
  "values-sequence",
  "remove-sequence",
  "thumbs-sequence",
  "side-effects",
  "list-likes",
  "list-dislikes",
  "list-likes-and-dislikes",
  "list-favorite-or-likes",
  "list-all-movies",
  "list-likes-page-1",
  "list-likes-page-2",
  "openapi",
];

function load<T>(version: string, name: string): T {
  return JSON.parse(readFileSync(join(fixtureRoot, version, `rating-${name}.json`), "utf8")) as T;
}
const ratingOf = (step: WireStep): number | undefined => step.readBack.UserData?.Rating;
const ids = (list: WireList): string[] => (list.Items ?? []).map((i) => i.Id).sort();
const names = (list: WireList): string[] => list.Items.map((i) => i.Name.replace(" (2024)", "").replace("Synthetic ", ""));

describe.each(versions)("rating fixtures, Jellyfin %s", (version) => {
  it("has every fixture, and each one parses", () => {
    expect(files).toHaveLength(12);
    for (const name of files) {
      expect(existsSync(join(fixtureRoot, version, `rating-${name}.json`)), `${version}/rating-${name}.json`).toBe(true);
      expect(() => load(version, name)).not.toThrow();
    }
  });

  describe("scrubbing", () => {
    const ratingFiles = readdirSync(join(fixtureRoot, version)).filter((f) => f.startsWith("rating-"));
    const fakeUsers = new Set(["user-ratings", "user-ratings-list", "user-test"]);
    const fakeServers = new Set(["server-1011", "server-124"]);

    it.each(ratingFiles)("%s holds no real id, host, token, or user", (file) => {
      const text = readFileSync(join(fixtureRoot, version, file), "utf8");
      expect(text).not.toMatch(/\b[0-9a-f]{32}\b/i);
      expect(text).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
      expect(text).not.toMatch(/127\.0\.0\.1|localhost|:1809[67]\b/);
      expect(text).not.toMatch(/https?:\/\/\d{1,3}(?:\.\d{1,3}){3}\b/);
      expect(text).not.toMatch(/"Pw"|"Password"/);
      for (const match of text.matchAll(/(?:ApiKey|api_key|AccessToken|Token)=([^&"\s]*)/g)) expect(match[1]).toBe("REDACTED");
      for (const match of text.matchAll(/"UserId":\s*"([^"]*)"/g)) expect(fakeUsers.has(match[1] ?? "")).toBe(true);
      for (const match of text.matchAll(/"ServerId":\s*"([^"]*)"/g)) expect(fakeServers.has(match[1] ?? "")).toBe(true);
    });
  });

  describe("values", () => {
    const sequence = load<{ steps: WireStep[]; outOfRange: WireStep[] }>(version, "values-sequence");

    it("every whole value from 1 to 10 and 7.5 reads back as sent", () => {
      for (const value of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 7.5]) {
        const step = sequence.steps.find((s) => s.step === `Rating ${value}`);
        expect(step, `Rating ${value}`).toBeDefined();
        expect(step?.status).toBe(200);
        expect(ratingOf(step as WireStep)).toBe(value);
      }
    });

    it("POST UserData answers with the stored user data", () => {
      for (const step of sequence.steps) expect(step.response?.Rating).toBe(ratingOf(step));
    });

    it("Likes reads true from 6.5 up and false below", () => {
      for (const step of sequence.steps) {
        const value = ratingOf(step) as number;
        expect(step.readBack.UserData?.Likes, `Rating ${value}`).toBe(value >= 6.5);
      }
    });

    it("a rating of 11 or -1 is refused with 400 and leaves the rating at 6.5", () => {
      expect(sequence.outOfRange.map((s) => s.step)).toEqual(["Rating 11", "Rating -1"]);
      for (const step of sequence.outOfRange) {
        expect(step.status).toBe(400);
        expect(ratingOf(step)).toBe(6.5);
      }
    });
  });

  describe("removal", () => {
    const candidates = load<{ candidates: { candidate: string; before: WireStep; after: WireStep }[] }>(version, "remove-sequence").candidates;
    const find = (name: string) => candidates.find((c) => c.candidate === name) as { candidate: string; before: WireStep; after: WireStep };

    it("every candidate starts from a rating of 8", () => {
      expect(candidates).toHaveLength(5);
      for (const c of candidates) expect(ratingOf(c.before)).toBe(8);
    });

    it("DELETE /UserItems/{id}/Rating clears the rating, and the key is absent, not null", () => {
      const after = find("DELETE Rating").after;
      expect(after.status).toBe(200);
      expect(after.readBack.UserData).toBeDefined();
      expect("Rating" in (after.readBack.UserData ?? {})).toBe(false);
      expect("Likes" in (after.readBack.UserData ?? {})).toBe(false);
    });

    it("an empty body leaves the rating at 8", () => {
      expect(ratingOf(find("empty body").after)).toBe(8);
    });

    it("{ Rating: null } leaves the rating at 8", () => {
      expect(ratingOf(find("Rating null").after)).toBe(8);
    });

    it("{ Likes: null } leaves the rating at 8", () => {
      expect(ratingOf(find("Likes null").after)).toBe(8);
    });

    it("{ Rating: 0 } stores a rating of 0 and does not clear it", () => {
      const data = find("Rating 0").after.readBack.UserData;
      expect(data?.Rating).toBe(0);
      expect(data?.Likes).toBe(false);
    });
  });

  describe("thumbs", () => {
    const steps = load<{ steps: WireStep[] }>(version, "thumbs-sequence").steps;
    const find = (name: string) => steps.find((s) => s.step === name) as WireStep;

    it("a like on an unrated film stores 10", () => {
      const step = find("like on an unrated film");
      expect(step.status).toBe(200);
      expect(step.readBack.UserData).toMatchObject({ Rating: 10, Likes: true });
    });

    it("a like overwrites a rating of 8 with 10", () => {
      expect(find("like over a rating of 8").readBack.UserData).toMatchObject({ Rating: 10, Likes: true });
    });

    it("a dislike overwrites a rating of 8 with 1", () => {
      expect(find("dislike over a rating of 8").readBack.UserData).toMatchObject({ Rating: 1, Likes: false });
    });

    it("a dislike overwrites a rating of 3 with 1", () => {
      expect(find("dislike over a rating of 3").readBack.UserData).toMatchObject({ Rating: 1, Likes: false });
    });

    it("DELETE /UserItems/{id}/Rating clears a thumbs rating", () => {
      const step = find("DELETE Rating");
      expect(step.status).toBe(200);
      expect("Rating" in (step.readBack.UserData ?? {})).toBe(false);
    });

    it("{ Likes: true } in the UserData body over a rating of 8 stores 10", () => {
      expect(find("Likes true in the body over a rating of 8").readBack.UserData).toMatchObject({ Rating: 10, Likes: true });
    });
  });

  describe("side effects", () => {
    const films = load<{ films: { film: string; before: WireUserData; afterRating: WireUserData; afterLike: WireUserData; afterDelete: WireUserData }[] }>(version, "side-effects").films;

    it("covers a played favourite, a film in progress, and an untouched film", () => {
      expect(films.map((f) => f.film)).toEqual(["item-h264", "item-av1", "item-sidecar"]);
      expect(films[0]?.before).toMatchObject({ Played: true, IsFavorite: true, PlayCount: 1 });
      expect(films[1]?.before.PlaybackPositionTicks).toBeGreaterThan(0);
      expect(films[1]?.before.LastPlayedDate).toMatch(/^2026-06-01/);
    });

    it("setting a rating, a like, or removing a rating leaves Played, position, LastPlayedDate, favourite, and PlayCount as they were", () => {
      for (const film of films) {
        for (const after of [film.afterRating, film.afterLike, film.afterDelete]) {
          expect(after.Played, film.film).toBe(film.before.Played);
          expect(after.PlaybackPositionTicks, film.film).toBe(film.before.PlaybackPositionTicks);
          expect(after.LastPlayedDate, film.film).toBe(film.before.LastPlayedDate);
          expect(after.IsFavorite, film.film).toBe(film.before.IsFavorite);
          expect(after.PlayCount, film.film).toBe(film.before.PlayCount);
        }
        expect(film.afterRating.Rating).toBe(8);
        expect(film.afterLike.Rating).toBe(10);
        expect("Rating" in film.afterDelete).toBe(false);
      }
    });
  });

  describe("lists", () => {
    const all = load<WireList>(version, "list-all-movies");
    const likes = load<WireList>(version, "list-likes");
    const dislikes = load<WireList>(version, "list-dislikes");
    const both = load<WireList>(version, "list-likes-and-dislikes");
    const favOrLikes = load<WireList>(version, "list-favorite-or-likes");
    const ratedIds = all.Items.filter((i) => typeof i.UserData?.Rating === "number").map((i) => i.Id).sort();

    it("the unfiltered movie list is the full-scan fallback: it carries every rated film with its rating", () => {
      expect(all.Items.length).toBe(all.TotalRecordCount);
      expect(all.setup?.length).toBe(9);
      expect(names(all)).toEqual(expect.arrayContaining(["ASS", "AV1", "Extras", "H264", "Multitrack", "Sidecar"]));
      expect(ratedIds).toHaveLength(5 + 1);
      expect(all.Items.find((i) => i.Name.includes("Versions"))?.UserData?.Rating).toBeUndefined();
    });

    it("filters=Likes lists the films rated 6.5 or more, and not every rated film", () => {
      const liked = all.Items.filter((i) => (i.UserData?.Rating ?? 0) >= 6.5).map((i) => i.Id).sort();
      expect(ids(likes)).toEqual(liked);
      expect(ids(likes)).not.toEqual(ratedIds);
      expect(names(likes).sort()).toEqual(["AV1", "Extras", "H264", "Multitrack"]);
    });

    it("filters=Likes holds every film rated 8 or more, so a cutoff of 8 is a client-side filter on it", () => {
      const eightPlus = all.Items.filter((i) => (i.UserData?.Rating ?? 0) >= 8).map((i) => i.Id);
      for (const id of eightPlus) expect(ids(likes)).toContain(id);
    });

    it("filters=Likes holds no film without a rating", () => {
      expect(likes.Items.every((i) => typeof i.UserData?.Rating === "number")).toBe(true);
    });

    it("a film whose rating was removed, a favourite, and a played film are in no Likes list", () => {
      for (const name of ["Versions", "HEVC", "BluRay"]) expect(names(likes).join()).not.toContain(name);
    });

    it(version === "10.11.7" ? "filters=Dislikes returns the same films as filters=Likes on 10.11.7" : "filters=Dislikes returns every film that is not liked, rated or not, on 12.4.0", () => {
      if (version === "10.11.7") {
        expect(ids(dislikes)).toEqual(ids(likes));
      } else {
        const notLiked = all.Items.filter((i) => (i.UserData?.Rating ?? 0) < 6.5).map((i) => i.Id).sort();
        expect(ids(dislikes)).toEqual(notLiked);
        expect(ids(dislikes)).not.toEqual(ratedIds);
      }
    });

    it(version === "10.11.7" ? "filters=Likes,Dislikes is answered with the Likes list on 10.11.7" : "filters=Likes,Dislikes is refused with 400 on 12.4.0", () => {
      if (version === "10.11.7") {
        expect(both.httpStatus).toBe(200);
        expect(ids(both)).toEqual(ids(likes));
      } else {
        expect(both.httpStatus).toBe(400);
      }
    });

    it("filters=IsFavoriteOrLikes returns only the favourite, not the liked films", () => {
      expect(names(favOrLikes)).toEqual(["HEVC HDR10"]);
    });

    it("no single request returns exactly the rated films", () => {
      for (const list of [likes, dislikes, both, favOrLikes]) expect(ids(list)).not.toEqual(ratedIds);
    });

    it("every rated film in a list carries a rating, an image, a year, and user data, and toBrowseCards keeps it", () => {
      for (const list of [likes, all]) {
        for (const item of list.Items.filter((i) => typeof i.UserData?.Rating === "number")) {
          expect(Object.keys(item.ImageTags ?? {}).length > 0 || item.PrimaryImageAspectRatio !== undefined, item.Name).toBe(true);
          expect(item.ProductionYear, item.Name).toBeDefined();
          expect(item.UserData, item.Name).toBeDefined();
        }
        expect(toBrowseCards(list.Items as unknown as BaseItemDto[])).toHaveLength(list.Items.length);
      }
    });

    it("the Likes list pages with limit and startIndex, and TotalRecordCount is the unpaged length", () => {
      const one = load<WireList>(version, "list-likes-page-1");
      const two = load<WireList>(version, "list-likes-page-2");
      expect(one.StartIndex).toBe(0);
      expect(two.StartIndex).toBe(2);
      expect(one.Items).toHaveLength(2);
      expect(one.TotalRecordCount).toBe(likes.Items.length);
      expect(two.TotalRecordCount).toBe(likes.Items.length);
      expect(ids({ ...one, Items: [...one.Items, ...two.Items] })).toEqual(ids(likes));
      expect(new Set([...one.Items, ...two.Items].map((i) => i.Id)).size).toBe(likes.Items.length);
    });
  });

  describe("openapi", () => {
    const spec = load<Record<string, unknown>>(version, "openapi");

    it("ItemSortBy has no value naming the user's own rating", () => {
      const sortBy = spec["ItemSortBy"] as string[];
      expect(sortBy).toContain("CommunityRating");
      expect(sortBy).toContain("CriticRating");
      expect(sortBy).toContain("IsFavoriteOrLiked");
      expect(sortBy.filter((v) => /rating|like/i.test(v)).sort()).toEqual(["CommunityRating", "CriticRating", "IsFavoriteOrLiked", "OfficialRating"]);
    });

    it("ItemFilter touches the user's rating only through Likes, Dislikes, and IsFavoriteOrLikes", () => {
      const filter = spec["ItemFilter"] as string[];
      expect(filter.filter((v) => /like|rating/i.test(v)).sort()).toEqual(["Dislikes", "IsFavoriteOrLikes", "Likes"]);
    });

    it("GET /Items has no query parameter for a minimum user rating", () => {
      const query = spec["GET /Items"] as string[];
      expect(query).toEqual(expect.arrayContaining(["filters", "limit", "startIndex", "enableTotalRecordCount"]));
      expect(query.filter((n) => /rating/i.test(n)).sort()).toEqual([
        "hasOfficialRating",
        "maxOfficialRating",
        "minCommunityRating",
        "minCriticRating",
        "minOfficialRating",
        "officialRatings",
        "hasParentalRating",
      ].sort());
    });

    it("UpdateUserItemDataDto carries Rating and Likes, and the Rating route accepts POST and DELETE", () => {
      expect(spec["UpdateUserItemDataDto"]).toEqual(expect.arrayContaining(["Rating", "Likes"]));
      expect(spec["/UserItems/{itemId}/Rating"]).toEqual(["delete", "post"]);
      expect(spec["/UserItems/{itemId}/UserData"]).toEqual(["get", "post"]);
    });
  });
});
