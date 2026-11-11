// A fuller Jellyfin mock for screenshots: the same endpoints and DTO shapes the
// e2e specs mock one by one, with one library of synthetic items and art.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

export const SERVER = "http://127.0.0.1:8096";
export const LAN = "http://192.168.50.10:8096";

const here = dirname(fileURLToPath(import.meta.url));
const artDir = join(here, "..", "fixtures", "art");
const artCache = new Map<string, Buffer>();
const art = (name: string): Buffer => {
  let data = artCache.get(name);
  if (!data) {
    data = readFileSync(join(artDir, `${name}.png`));
    artCache.set(name, data);
  }
  return data;
};

export const frameDataUrl = (): string => `data:image/png;base64,${art("frame").toString("base64")}`;

export interface MockOptions {
  empty?: boolean;
  noQuickConnect?: boolean;
  holdQuickConnect?: boolean;
  fail?: boolean;
  duration?: number;
  disc?: boolean;
  short?: boolean;
  trickplay?: boolean;
  segments?: Array<Record<string, unknown>>;
  playbackDelayMs?: number;
  rowDelayMs?: number;
  // /Items/Latest for lib-movies returns 18 movies, so the row scrolls.
  longRows?: boolean;
  // Continue watching and Next up are empty, so the Home hero is the newest item.
  homeLatestOnly?: boolean;
  // /Items/{id} answers after this delay (the detail loading state).
  detailDelayMs?: number;
  // /Items/{id} answers 500 (the detail error state).
  detailError?: boolean;
  // /Shows/NextUp?seriesId=s1: the part-watched episode (default), the unstarted one after it, or nothing.
  seriesNextUp?: "resume" | "next" | "none";
  // Movies have a poster but no backdrop (the poster-beside-text detail layout).
  noBackdrop?: boolean;
}

export const ticks = (seconds: number): number => Math.round(seconds * 1e7);

type Dto = Record<string, any>;

const stream = (extra: Dto): Dto => ({ IsExternal: false, IsDefault: false, IsForced: false, ...extra });
const hdrSource: Dto = {
  Id: "src-4k", Name: "4K HDR", Container: "mkv", Size: 58 * 1024 ** 3, Path: "/media/long-quiet-4k.mkv", Protocol: "File", SupportsDirectPlay: true,
  MediaStreams: [
    stream({ Index: 0, Type: "Video", Codec: "hevc", Profile: "Main 10", Width: 3840, Height: 2160, BitDepth: 10, VideoRange: "HDR", VideoRangeType: "DOVIWithHDR10", IsDefault: true }),
    stream({ Index: 1, Type: "Audio", Codec: "truehd", Language: "eng", Channels: 8, IsDefault: true, Title: "TrueHD Atmos 7.1" }),
    stream({ Index: 2, Type: "Audio", Codec: "ac3", Language: "eng", Channels: 6 }),
    stream({ Index: 3, Type: "Audio", Codec: "eac3", Language: "fra", Channels: 6 }),
    stream({ Index: 4, Type: "Subtitle", Codec: "pgssub", Language: "eng", IsDefault: true }),
    stream({ Index: 5, Type: "Subtitle", Codec: "ass", Language: "fra", IsExternal: true }),
  ],
};
const sdrSource: Dto = {
  Id: "src-hd", Name: "1080p", Container: "mp4", Size: 9 * 1024 ** 3, Path: "/media/long-quiet.mp4", Protocol: "File", SupportsDirectPlay: true,
  MediaStreams: [
    stream({ Index: 0, Type: "Video", Codec: "h264", Width: 1920, Height: 1080, BitDepth: 8, VideoRange: "SDR", VideoRangeType: "SDR", IsDefault: true }),
    stream({ Index: 1, Type: "Audio", Codec: "aac", Language: "eng", Channels: 2, IsDefault: true }),
  ],
};
const simpleSource = (id: string): Dto => ({
  Id: `src-${id}`, Name: "1080p", Container: "mkv", Path: `/media/${id}.mkv`, Protocol: "File", SupportsDirectPlay: true,
  MediaStreams: [
    stream({ Index: 0, Type: "Video", Codec: "hevc", Width: 1920, Height: 1080, BitDepth: 10, VideoRange: "SDR", VideoRangeType: "SDR", IsDefault: true }),
    stream({ Index: 1, Type: "Audio", Codec: "eac3", Language: "eng", Channels: 6, IsDefault: true }),
    stream({ Index: 2, Type: "Subtitle", Codec: "subrip", Language: "eng" }),
  ],
});
const discSource: Dto = { Id: "src-disc", Name: "Blu-ray", Path: "/media/Disc/BDMV", Protocol: "File", VideoType: "BluRay", SupportsDirectPlay: true, MediaStreams: [] };

const people = [
  ["Mara Ellison", "Ines Varga"], ["Theo Akande", "Rafe"], ["Junie Park", "Dr. Holm"], ["Callum Reyes", "The Pilot"], ["Odette Lindqvist", "Sabine"],
].map(([Name, Role]) => ({ Name, Role, Type: "Actor" }));

const movies: Record<string, Dto> = {
  m1: { Name: "The Long Quiet", ProductionYear: 2023, poster: "p1", backdrop: "b1", RunTimeTicks: ticks(7380), Genres: ["Drama", "Science Fiction"], OfficialRating: "PG-13", CommunityRating: 7.8,
    Overview: "A radio astronomer on a remote island station picks up a signal that repeats every nineteen minutes, and has one winter to decide who to tell.",
    People: people, MediaSources: [hdrSource, sdrSource], Trickplay: true, Chapters: true },
  m2: { Name: "Saltwater Hours", ProductionYear: 2021, poster: "p2", backdrop: "b2", RunTimeTicks: ticks(6300), Genres: ["Drama"], Overview: "Two sisters reopen their late father's ferry for one last summer.", People: people.slice(1, 4), resume: ticks(2460), MediaSources: [hdrSource, sdrSource] },
  m3: { Name: "Northern Line", ProductionYear: 2019, poster: "p3", backdrop: "b3", RunTimeTicks: ticks(5940), Genres: ["Thriller"], Overview: "A night-shift signaller notices a train that is not on any timetable.", People: people.slice(0, 3), played: true, favorite: true },
  m4: { Name: "Paper Moons", ProductionYear: 2024, poster: "p4", backdrop: "b1", RunTimeTicks: ticks(6120), Genres: ["Comedy"], Overview: "A failing theatre troupe stages a moon landing." },
  m5: { Name: "Glass Orchard", ProductionYear: 2022, poster: "p5", backdrop: "b2", RunTimeTicks: ticks(6600), Genres: ["Mystery"], Overview: "An heir inherits a greenhouse that grows only in the dark." },
  m6: { Name: "Low Tide", ProductionYear: 2020, poster: "p6", backdrop: "b3", RunTimeTicks: ticks(5400), Genres: ["Documentary"], Overview: "A year on the mudflats." },
};
const series: Record<string, Dto> = {
  s1: { Name: "Harbor Lights", ProductionYear: 2022, poster: "p5", backdrop: "b2" },
  s2: { Name: "Quiet Orbit", ProductionYear: 2024, poster: "p4", backdrop: "b3" },
};
const episodeNames = ["Landfall", "The Keeper's Log", "Fog Signal", "Slack Water", "Spring Tide", "Lantern Room"];
const episodes: Record<string, Dto> = Object.fromEntries(episodeNames.map((name, index) => [`ep-${index + 1}`, {
  Name: name, IndexNumber: index + 1, ParentIndexNumber: 1, thumb: index % 2 ? "t2" : "t1",
  Overview: "The keeper's daughter finds a ledger that does not match the shipping records, and the harbor master would rather she forgot it.",
  resume: index === 1 ? ticks(1320) : 0,
}]));

// DC-only BlurHashes (average colour) matching the average colour of the synthetic backdrops b1-b3.
const backdropHashes: Record<string, string> = {"b1": "009ly~", "b2": "00Ip-7", "b3": "00981K"};
function movieDto(id: string, opts: MockOptions): Dto {
  const m = movies[id];
  return {
    Id: id, Name: m.Name, Type: "Movie", ProductionYear: m.ProductionYear, RunTimeTicks: m.RunTimeTicks, Overview: m.Overview, Genres: m.Genres,
    OfficialRating: m.OfficialRating, CommunityRating: m.CommunityRating, People: m.People ?? [],
    ImageTags: { Primary: `tag-${id}`, Logo: `logo-${id}` }, PrimaryImageAspectRatio: 2 / 3,
    ...(opts.noBackdrop ? {} : {
      BackdropImageTags: [`bd-${id}`],
      ImageBlurHashes: { Backdrop: { [`bd-${id}`]: backdropHashes[m.backdrop] ?? backdropHashes.b1 } },
    }),
    MediaSources: opts.disc && id === "m1" ? [discSource] : (m.MediaSources ?? [simpleSource(id)]).map((s: Dto) => ({ ...s, HasSegments: Boolean(opts.segments) })),
    ...(m.Trickplay && opts.trickplay ? { Trickplay: { "src-4k": { 320: { Width: 320, Height: 180, TileWidth: 5, TileHeight: 2, ThumbnailCount: 10, Interval: 738000 } } } } : {}),
    ...(m.Chapters && opts.trickplay ? { Chapters: [
      { StartPositionTicks: 0, Name: "Station" }, { StartPositionTicks: ticks(1500), Name: "The Signal" }, { StartPositionTicks: ticks(3600), Name: "Winter" }, { StartPositionTicks: ticks(5800), Name: "Thaw" },
    ] } : {}),
    UserData: { Played: Boolean(m.played), IsFavorite: Boolean(m.favorite), PlaybackPositionTicks: m.resume ?? 0 },
  };
}
function seriesDto(id: string): Dto {
  const s = series[id];
  return {
    Id: id, Name: s.Name, Type: "Series", ProductionYear: s.ProductionYear, ImageTags: { Primary: `tag-${id}` }, BackdropImageTags: [`bd-${id}`], PrimaryImageAspectRatio: 2 / 3,
    ...(id === "s1" ? { Overview: "A lighthouse keeper's daughter uncovers the harbor's oldest secret.", Genres: ["Drama", "Mystery"], EndDate: "2024-11-01T00:00:00.0000000Z" } : {}),
    ...(id === "s2" ? { UserData: { UnplayedItemCount: 3 } } : {}),
  };
}
function episodeDto(id: string, opts: MockOptions = {}): Dto {
  const e = episodes[id];
  return {
    Id: id, Name: e.Name, Type: "Episode", SeriesId: "s1", SeriesName: "Harbor Lights", SeriesPrimaryImageTag: "tag-s1", SeasonId: "se1", SeasonName: "Season 1",
    ParentBackdropItemId: "s1", ParentBackdropImageTags: ["bd-s1"],
    ParentIndexNumber: 1, IndexNumber: e.IndexNumber, RunTimeTicks: opts.short ? ticks(25) : ticks(2700), Overview: e.Overview, Genres: ["Drama"],
    People: people.slice(0, 3), ImageTags: { Primary: `tag-${id}` }, PrimaryImageAspectRatio: 16 / 9, ProductionYear: 2022,
    MediaSources: [simpleSource(id)],
    UserData: { Played: e.IndexNumber === 1, IsFavorite: false, PlaybackPositionTicks: opts.short ? 0 : e.resume },
  };
}
function imageFor(id: string, type: string): string {
  if (type === "Logo") return "logo";
  if (movies[id]) return type === "Backdrop" ? movies[id].backdrop : type === "Thumb" ? movies[id].backdrop : movies[id].poster;
  if (series[id]) return type === "Backdrop" || type === "Thumb" ? series[id].backdrop : series[id].poster;
  if (episodes[id]) return episodes[id].thumb;
  return "p6";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Stubs the media element so the browser player reaches "playing" without media.
async function stubMediaElement(page: Page, opts: MockOptions): Promise<void> {
  await page.addInitScript(({ fail, duration }) => {
    Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => duration });
    HTMLMediaElement.prototype.play = function play() {
      queueMicrotask(() => {
        this.dispatchEvent(new Event("loadedmetadata"));
        this.dispatchEvent(new Event("playing"));
        if (fail) this.dispatchEvent(new Event("error"));
      });
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() { this.dispatchEvent(new Event("pause")); };
    HTMLMediaElement.prototype.load = () => undefined;
    Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get: () => false });
    Object.defineProperty(HTMLMediaElement.prototype, "src", { configurable: true, get: () => "", set: () => undefined });
  }, { fail: Boolean(opts.fail), duration: opts.duration ?? 7380 });
}

// Returns the mock's 404 log (method and path) so a capture run can fail on drift.
export async function installMockServer(page: Page, opts: MockOptions = {}): Promise<string[]> {
  const notFound: string[] = [];
  await stubMediaElement(page, opts);
  for (const origin of [SERVER, LAN]) {
    await page.route(`${origin}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const p = url.pathname;
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
      const missing = () => {
        notFound.push(`${request.method()} ${p}`);
        return route.fulfill({ status: 404, headers: cors });
      };
      const json = (body: unknown) => route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (p.startsWith("/Sessions/Playing")) return route.fulfill({ status: 204, headers: cors });
      const img = /^\/Items\/([^/]+)\/Images\/(\w+)$/.exec(p);
      if (img) return route.fulfill({ status: 200, headers: cors, contentType: "image/png", body: art(imageFor(img[1], img[2])) });
      if (/\/Trickplay\//.test(p)) return route.fulfill({ status: 200, headers: cors, contentType: "image/png", body: art("trick") });
      if (/^\/Videos\/[^/]+\/stream/.test(p)) return route.fulfill({ status: 200, headers: cors, contentType: "video/mp4", body: "" });
      if (/^\/MediaSegments\//.test(p)) {
        const items = opts.segments ?? [];
        return json({ Items: items, TotalRecordCount: items.length, StartIndex: 0 });
      }
      const info = /^\/Items\/([^/]+)\/PlaybackInfo$/.exec(p);
      if (info) {
        if (opts.playbackDelayMs) await sleep(opts.playbackDelayMs);
        const id = info[1];
        const dto = movies[id] ? movieDto(id, opts) : episodeDto(id, opts);
        let sources: Dto[] = dto.MediaSources;
        if (opts.disc && url.searchParams.get("EnableDirectPlay") === "false") sources = sources.map((s) => ({ ...s, SupportsDirectPlay: false }));
        return json({ PlaySessionId: "play-1", MediaSources: sources.slice(0, 1) });
      }
      const detail = /^\/Items\/([^/]+)$/.exec(p);
      if (detail && p !== "/Items/Latest") {
        const id = detail[1];
        if (opts.detailDelayMs) await sleep(opts.detailDelayMs);
        if (opts.detailError) return route.fulfill({ status: 500, headers: cors });
        if (movies[id]) return json(movieDto(id, opts));
        if (episodes[id]) return json(episodeDto(id, opts));
        if (series[id]) return json(seriesDto(id));
        return missing();
      }
      if (opts.rowDelayMs && ["/UserItems/Resume", "/Shows/NextUp", "/Items/Latest", "/UserViews"].includes(p)) await sleep(opts.rowDelayMs);
      switch (p) {
        case "/System/Info/Public":
          return json({ ServerName: "Hearth", Version: "10.11.7", Id: "server-1" });
        case "/QuickConnect/Enabled":
          return json(!opts.noQuickConnect);
        case "/QuickConnect/Initiate":
          return json({ Secret: "s", Code: "482913", Authenticated: false });
        case "/QuickConnect/Connect":
          return json({ Secret: "s", Code: "482913", Authenticated: !opts.holdQuickConnect });
        case "/Users/AuthenticateWithQuickConnect":
          return json({ AccessToken: "test-token", User: { Id: "user-1", Name: "Sam" } });
        case "/Users/AuthenticateByName":
          return route.fulfill({ status: 401, headers: cors, contentType: "application/json", body: "{}" });
        case "/UserViews":
          return json({ Items: opts.empty ? [] : [
            { Id: "lib-movies", Name: "Movies", CollectionType: "movies", ImageTags: { Primary: "tag-lib1" } },
            { Id: "lib-shows", Name: "Shows", CollectionType: "tvshows", ImageTags: { Primary: "tag-lib2" } },
          ] });
        case "/UserItems/Resume":
          return json({ Items: opts.empty || opts.homeLatestOnly ? [] : [movieDto("m2", opts), episodeDto("ep-2")] });
        case "/Shows/NextUp": {
          const seriesId = url.searchParams.get("seriesId") ?? url.searchParams.get("SeriesId");
          if (seriesId) {
            const mode = opts.seriesNextUp ?? "resume";
            if (seriesId !== "s1" || mode === "none") return json({ Items: [] });
            return json({ Items: [episodeDto(mode === "next" ? "ep-3" : "ep-2", opts)] });
          }
          return json({ Items: opts.empty || opts.homeLatestOnly ? [] : [episodeDto("ep-3"), { ...episodeDto("ep-1"), SeriesId: "s2", SeriesName: "Quiet Orbit", Name: "Perigee" }] });
        }
        case "/Items/Latest": {
          if (opts.empty) return json([]);
          const parent = url.searchParams.get("parentId") ?? url.searchParams.get("ParentId");
          if (parent === "lib-shows") return json([seriesDto("s1"), seriesDto("s2")]);
          const latest = ["m1", "m4", "m5", "m6", "m3", "m2"].map((id) => movieDto(id, opts));
          if (opts.longRows) return json([...latest, ...latest.map((m) => ({ ...m, Id: `${m.Id}-b` })), ...latest.map((m) => ({ ...m, Id: `${m.Id}-c` }))]);
          return json(latest);
        }
        case "/Items": {
          const term = url.searchParams.get("searchTerm");
          if (term) {
            const all = [...Object.keys(movies).map((id) => movieDto(id, opts)), seriesDto("s1"), seriesDto("s2"), ...Object.keys(episodes).map((id) => episodeDto(id))];
            const found = all.filter((i) => i.Name.toLowerCase().includes(term.toLowerCase()));
            return json({ Items: found, TotalRecordCount: found.length });
          }
          if (url.searchParams.get("parentId") === "lib-shows") return json({ Items: [seriesDto("s1"), seriesDto("s2")], TotalRecordCount: 2 });
          const list = Object.keys(movies).map((id) => movieDto(id, opts));
          const all = [...list, ...list.map((m) => ({ ...m, Id: `${m.Id}-b` })), ...list.map((m) => ({ ...m, Id: `${m.Id}-c` }))];
          return json({ Items: all, TotalRecordCount: all.length });
        }
        case "/Search/Hints": {
          const term = (url.searchParams.get("searchTerm") ?? "").toLowerCase();
          const hints = [
            ...Object.entries(movies).map(([Id, m]) => ({ Id, Name: m.Name, Type: "Movie", ProductionYear: m.ProductionYear })),
            ...Object.entries(series).map(([Id, s]) => ({ Id, Name: s.Name, Type: "Series", ProductionYear: s.ProductionYear })),
          ];
          const found = hints.filter((h) => h.Name.toLowerCase().includes(term));
          return json({ SearchHints: found, TotalRecordCount: found.length });
        }
        case "/Shows/s1/Seasons":
          return json({ Items: [
            { Id: "se0", Name: "Specials", Type: "Season", IndexNumber: 0 },
            { Id: "se1", Name: "Season 1", Type: "Season", IndexNumber: 1 },
            { Id: "se2", Name: "Season 2", Type: "Season", IndexNumber: 2 },
          ] });
        case "/Shows/s1/Episodes":
          if (url.searchParams.get("adjacentTo")) return json({ Items: [episodeDto("ep-1", opts), episodeDto("ep-2", opts)] });
          return json({ Items: Object.keys(episodes).map((id) => episodeDto(id, opts)) });
        default:
          return missing();
      }
    });
  }
  return notFound;
}
