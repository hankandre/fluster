// A fuller Jellyfin mock for screenshots: the same endpoints and DTO shapes the
// e2e specs mock one by one, with one library of synthetic items and art.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { filterByGenre, genreItemsOf, genresDto, parentOf } from "./mock-genres";

export const SERVER = "http://127.0.0.1:8096";
export const LAN = "http://192.168.50.10:8096";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "..", "..", "tests", "fixtures", "jellyfin");
let culturesCache: unknown;
const cultures = (): unknown => (culturesCache ??= JSON.parse(readFileSync(join(fixtureDir, "12.4.0", "account-language-cultures.json"), "utf8")));
// The Configuration a new account has (10.11.7 fixture); the mock sets only the subtitle language.
const cultureConfiguration: Record<string, unknown> = (JSON.parse(readFileSync(join(fixtureDir, "10.11.7", "account-language-users-me-new-user.json"), "utf8")) as { Configuration: Record<string, unknown> }).Configuration;
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

export const artDataUrl = (name: string): string => `data:image/png;base64,${art(name).toString("base64")}`;
export const frameDataUrl = (): string => artDataUrl("frame");

export interface MockOptions {
  // The series Harbor Lights and its episodes serve bright, busy art, and ep-2 leads Continue watching (contrast captures).
  worstCaseArt?: boolean;
  empty?: boolean;
  noQuickConnect?: boolean;
  holdQuickConnect?: boolean;
  // /QuickConnect/Connect answers 404, as Jellyfin does once the code has expired.
  quickConnectExpired?: boolean;
  fail?: boolean;
  duration?: number;
  disc?: boolean;
  // PlaybackInfo offers an HLS conversion instead of the file (the browser engine refuses it as desktop-only).
  converted?: boolean;
  short?: boolean;
  // Seeds the fluster.preferences record before the page loads, only when the page has none yet.
  preferences?: Record<string, unknown>;
  trickplay?: boolean;
  // Serves the movie's chapters without trickplay (trickplay serves both).
  chapters?: boolean;
  segments?: Array<Record<string, unknown>>;
  playbackDelayMs?: number;
  rowDelayMs?: number;
  // /Items/Latest for lib-movies returns 18 movies, so the row scrolls.
  longRows?: boolean;
  // Ids that /Items/Latest leaves out. The test adds to the set while it runs, to make a card disappear.
  hiddenFromLatest?: Set<string>;
  // Continue watching is empty, so the Home hero is the newest item.
  homeLatestOnly?: boolean;
  // The in-progress film Saltwater Hours was last played 30 days ago, so Home leaves it out of Continue watching.
  agedOutFilm?: boolean;
  // Everything the viewer played, and every in-progress item, was last played over 60 days ago, so Home leaves the
  // Continue watching row out and the hero is the newest addition.
  allAgedOut?: boolean;
  // A stopped session marks its item as finished now: Resume drops it, the recently-played list gains it, and the
  // next episode of its series leads Next up.
  finishOnStop?: boolean;
  // /Items/{id} answers after this delay (the detail loading state).
  detailDelayMs?: number;
  // /Items/{id} answers 500 (the detail error state).
  detailError?: boolean;
  // /Shows/NextUp?seriesId=s1: the part-watched episode (default), the unstarted one after it, or nothing.
  seriesNextUp?: "resume" | "next" | "none";
  // Movies have a poster but no backdrop (the poster-beside-text detail layout).
  noBackdrop?: boolean;
  // /Items?parentId=lib-movies answers 150 synthetic movies, honouring startIndex and limit.
  bigLibrary?: boolean;
  // Library pages after the first (startIndex > 0) answer 500.
  libraryPageError?: boolean;
  // Library /Items answers after this delay (the library loading state).
  libraryItemsDelayMs?: number;
  // Delays that apply from the moment a test sets them, to prove a screen shown again does not wait for the
  // server: library /Items answers after libraryMs, Home rows after rowsMs.
  liveDelay?: { libraryMs?: number; rowsMs?: number };
  // Library /Items answers 500 (the library error state).
  libraryItemsError?: boolean;
  // /Genres answers an empty list, or 500.
  noGenres?: boolean;
  genresError?: boolean;
  // /UserViews returns twelve libraries, so the nav overflows on a phone.
  manyLibraries?: boolean;
  // /Items?searchTerm answers after this delay (the search loading state).
  searchDelayMs?: number;
  // /Items?searchTerm answers 500 (the search error state).
  searchError?: boolean;
  // /Items?searchTerm matches 60 copies of a movie and honours startIndex and limit, so "o" has more than one page.
  longSearch?: boolean;
  // POST/DELETE on /UserPlayedItems/ and /UserFavoriteItems/ answer 500 (the Watched and Favorite failure toast).
  flagError?: boolean;
  // The account's SubtitleLanguagePreference on /Users/Me ("" or absent: none).
  subtitleLanguage?: string;
  // The account's AudioLanguagePreference on /Users/Me ("" or absent: none).
  audioLanguage?: string;
  // The 4K version of m1 (only) lists 52 subtitle tracks; "no-default" leaves English without the default flag.
  manySubtitles?: "default" | "no-default";
  // The 4K version of m1 and m2 opens on a long audio title: "English · Director's commentary with cast · AC-3 Stereo".
  longAudioTitle?: boolean;
  // POST /Users/Configuration answers 403 ("refuse") or 500 ("fail") and stores nothing.
  configurationSave?: "refuse" | "fail";
  // Receives every POST /Users/Configuration body, in order, as the server got it.
  configurationLog?: Record<string, unknown>[];
  // /Users/Me answers after this delay (the Languages loading state).
  languagesDelayMs?: number;
  // /Users/Me answers 500 (the Languages read-failed state).
  languagesError?: boolean;
}

export const ticks = (seconds: number): number => Math.round(seconds * 1e7);

type Dto = Record<string, any>;

const stream = (extra: Dto): Dto => ({ IsExternal: false, IsDefault: false, IsForced: false, ...extra });
const hdrSource: Dto = {
  Id: "src-4k", Name: "4K HDR", Container: "mkv", Size: 58 * 1024 ** 3, Path: "/media/long-quiet-4k.mkv", Protocol: "File", SupportsDirectPlay: true, DefaultAudioStreamIndex: 1,
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
  Id: "src-hd", Name: "1080p", Container: "mp4", Size: 9 * 1024 ** 3, Path: "/media/long-quiet.mp4", Protocol: "File", SupportsDirectPlay: true, DefaultAudioStreamIndex: 1,
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
// 52 subtitle tracks in 32 languages, 3 of them English (one forced, one hearing-impaired), one untagged. The 32
// languages are eng plus 31 others; the German one is tagged ger, and a second German track is tagged deu.
const manyLanguages = ["eng", "fra", "spa", "ger", "ita", "por", "rus", "jpn", "kor", "zho", "ara", "hin", "tur", "pol", "nld", "swe", "nor", "dan", "fin", "ces", "hun", "ron", "ell", "heb", "tha", "vie", "ind", "ukr", "bul", "hrv", "srp", "slk"];
function manySubtitleStreams(mode: "default" | "no-default", firstIndex: number): Dto[] {
  const tracks: Dto[] = manyLanguages.map((language, i) => stream({
    Index: firstIndex + i, Type: "Subtitle", Codec: "subrip", Language: language, IsDefault: language === "eng" && mode === "default",
  }));
  const extra: Dto[] = [
    { Language: "eng", IsForced: true },
    { Language: "eng", IsHearingImpaired: true, Title: "English SDH" },
    { Language: "deu" },
    ...manyLanguages.slice(1, 17).map((Language) => ({ Language })),
    {},
  ];
  extra.forEach((fields, i) => tracks.push(stream({ Index: firstIndex + manyLanguages.length + i, Type: "Subtitle", Codec: "subrip", ...fields })));
  return tracks;
}
const discSource: Dto = { Id: "src-disc", Name: "Blu-ray", Path: "/media/Disc/BDMV", Protocol: "File", VideoType: "BluRay", SupportsDirectPlay: true, MediaStreams: [] };

const people = [
  ["Mara Ellison", "Ines Varga"], ["Theo Akande", "Rafe"], ["Junie Park", "Dr. Holm"], ["Callum Reyes", "The Pilot"], ["Odette Lindqvist", "Sabine"],
  ["Wen Zhao", "Captain Ruiz"], ["Priya Nair", "Dr. Okafor"], ["Lars Bergstrom", "The Keeper"], ["Amara Osei", "Nell"], ["Felix Moreau", "Station Chief"],
].map(([Name, Role], index) => ({
  Id: `person-${index + 1}`, Name, Role, Type: "Actor",
  // Persons 1, 2, 4, 6, 7, and 9 have a picture; the others fall back to initials.
  ...([1, 2, 4, 6, 7, 9].includes(index + 1) ? { PrimaryImageTag: `tag-person-${index + 1}` } : {}),
}));

const movies: Record<string, Dto> = {
  m1: { Name: "The Long Quiet", ProductionYear: 2023, poster: "p1", backdrop: "b1", RunTimeTicks: ticks(7380), Genres: ["Drama", "Science Fiction"], OfficialRating: "PG-13", CommunityRating: 7.8, CriticRating: 91,
    Overview: "A radio astronomer on a remote island station picks up a signal that repeats every nineteen minutes, and has one winter to decide who to tell.",
    People: people, MediaSources: [hdrSource, sdrSource], Trickplay: true, Chapters: true },
  m2: { Name: "Saltwater Hours", ProductionYear: 2021, poster: "p2", backdrop: "b2", RunTimeTicks: ticks(6300), Genres: ["Drama"], Overview: "Two sisters reopen their late father's ferry for one last summer.", People: people.slice(1, 4), resume: ticks(2460), MediaSources: [hdrSource, sdrSource] },
  m3: { Name: "Northern Line", ProductionYear: 2019, poster: "p3", backdrop: "b3", RunTimeTicks: ticks(5940), Genres: ["Thriller"], Overview: "A night-shift signaller notices a train that is not on any timetable.", People: people.slice(0, 3), played: true, favorite: true },
  m4: { Name: "Paper Moons", ProductionYear: 2024, poster: "p4", backdrop: "b1", RunTimeTicks: ticks(6120), Genres: ["Comedy"], Overview: "A failing theatre troupe stages a moon landing." },
  m5: { Name: "Glass Orchard", ProductionYear: 2022, poster: "p5", backdrop: "b2", RunTimeTicks: ticks(6600), Genres: ["Mystery"], Overview: "An heir inherits a greenhouse that grows only in the dark." },
  m6: { Name: "Low Tide", ProductionYear: 2020, poster: "p6", backdrop: "b3", RunTimeTicks: ticks(5400), Genres: ["Documentary"], Overview: "A year on the mudflats." },
};
const series: Record<string, Dto> = {
  s1: { Name: "Harbor Lights", ProductionYear: 2022, poster: "p5", backdrop: "b2", Genres: ["Drama", "Mystery"] },
  s2: { Name: "Quiet Orbit", ProductionYear: 2024, poster: "p4", backdrop: "b3", Genres: ["Drama"] },
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
    GenreItems: genreItemsOf(m.Genres), ParentId: parentOf("Movie"),
    OfficialRating: m.OfficialRating, CommunityRating: m.CommunityRating, CriticRating: m.CriticRating, People: m.People ?? [],
    ImageTags: { Primary: `tag-${id}`, Logo: `logo-${id}` }, PrimaryImageAspectRatio: 2 / 3,
    ...(opts.noBackdrop ? {} : {
      BackdropImageTags: [`bd-${id}`],
      ImageBlurHashes: { Backdrop: { [`bd-${id}`]: backdropHashes[m.backdrop] ?? backdropHashes.b1 } },
    }),
    MediaSources: opts.disc && id === "m1" ? [discSource] : (m.MediaSources ?? [simpleSource(id)]).map((s: Dto) => ({
      ...(opts.manySubtitles && id === "m1" && s.Id === "src-4k"
        ? { ...s, MediaStreams: [...s.MediaStreams.filter((x: Dto) => x.Type !== "Subtitle"), ...manySubtitleStreams(opts.manySubtitles, 4)] }
        : opts.longAudioTitle && (id === "m1" || id === "m2") && s.Id === "src-4k"
          ? { ...s, MediaStreams: s.MediaStreams.map((x: Dto) => x.Index === 1 ? { ...x, Codec: "ac3", Channels: 2, Title: "Director's commentary with cast" } : x) }
          : s),
      HasSegments: Boolean(opts.segments),
    })),
    ...(m.Trickplay && opts.trickplay ? { Trickplay: { "src-4k": { 320: { Width: 320, Height: 180, TileWidth: 5, TileHeight: 2, ThumbnailCount: 10, Interval: 738000 } } } } : {}),
    ...(m.Chapters && (opts.trickplay || opts.chapters) ? { Chapters: [
      { StartPositionTicks: 0, Name: "Station" }, { StartPositionTicks: ticks(1500), Name: "The Signal" }, { StartPositionTicks: ticks(3600), Name: "Winter" }, { StartPositionTicks: ticks(5800), Name: "Thaw" },
    ] } : {}),
    UserData: { Played: Boolean(m.played), IsFavorite: Boolean(m.favorite), PlaybackPositionTicks: m.resume ?? 0 },
  };
}
function seriesDto(id: string): Dto {
  const s = series[id];
  return {
    Id: id, Name: s.Name, Type: "Series", ProductionYear: s.ProductionYear, ParentId: parentOf("Series"), ImageTags: { Primary: `tag-${id}` }, BackdropImageTags: [`bd-${id}`], PrimaryImageAspectRatio: 2 / 3,
    ...(id === "s1" ? { Overview: "A lighthouse keeper's daughter uncovers the harbor's oldest secret.", CommunityRating: 8.1, EndDate: "2024-11-01T00:00:00.0000000Z" } : {}),
    ...(s.Genres ? { Genres: s.Genres } : {}),
    GenreItems: genreItemsOf(s.Genres),
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
function boxSetDto(): Dto {
  return { Id: "box-1", Name: "Harbor Collection", Type: "BoxSet", ImageTags: { Primary: "tag-box-1" }, PrimaryImageAspectRatio: 2 / 3 };
}
const MORE_LIBRARIES = ["Documentaries", "Anime", "Concerts", "Classics", "Kids", "Shorts", "Foreign", "Specials", "Family", "Archive"];
function bigMovie(index: number, opts: MockOptions): Dto {
  return { ...movieDto("m1", opts), Id: `big-${index}`, Name: `Big Movie ${String(index).padStart(3, "0")}` };
}
function imageFor(id: string, type: string, opts: MockOptions = {}): string {
  if (type === "Logo") return "logo";
  if (opts.worstCaseArt) {
    if (id === "s1") return type === "Backdrop" || type === "Thumb" ? "worst-backdrop" : "worst-poster";
    if (episodes[id]) return "worst-still";
  }
  const person = /^person-(\d+)$/.exec(id);
  // Person 1 has a true portrait (head in the top third) so the cast crop is visible.
  if (person) return person[1] === "1" ? "portrait" : `p${(Number(person[1]) - 1) % 6 + 1}`;
  if (movies[id]) return type === "Backdrop" ? movies[id].backdrop : type === "Thumb" ? movies[id].backdrop : movies[id].poster;
  if (series[id]) return type === "Backdrop" || type === "Thumb" ? series[id].backdrop : series[id].poster;
  if (episodes[id]) return episodes[id].thumb;
  return "p6";
}

const LONG_SEARCH_COUNT = 60;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Dates are relative to now, so Home's window never ages the mock's items out as time passes.
const DAY_MS = 86_400_000;
const daysAgo = (days: number): string => new Date(Date.now() - days * DAY_MS).toISOString();
const playedOn = (dto: Dto, days: number): Dto => ({ ...dto, UserData: { ...dto.UserData, LastPlayedDate: daysAgo(days) } });
// A next episode carries the date it was added, long ago, so it is not "new".
const addedLongAgo = (dto: Dto): Dto => ({ ...dto, DateCreated: daysAgo(90) });

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
  // Episodes finished while this page was open (opts.finishOnStop), with the time they were finished.
  const finishedNow = new Map<string, number>();
  // The account's Configuration. A save replaces the whole object, as Jellyfin does.
  let configuration: Record<string, unknown> = { ...cultureConfiguration, SubtitleLanguagePreference: opts.subtitleLanguage ?? "", AudioLanguagePreference: opts.audioLanguage ?? "" };
  await stubMediaElement(page, opts);
  if (opts.preferences) {
    await page.addInitScript((record) => {
      if (window.localStorage.getItem("fluster.preferences") === null) window.localStorage.setItem("fluster.preferences", JSON.stringify({ version: 1, ...record }));
    }, opts.preferences);
  }
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
      if (p === "/Sessions/Playing/Stopped" && opts.finishOnStop) {
        const stopped = request.postDataJSON() as { ItemId?: string } | null;
        if (stopped?.ItemId) finishedNow.set(stopped.ItemId, Date.now());
      }
      if (p.startsWith("/Sessions/Playing")) return route.fulfill({ status: 204, headers: cors });
      const img = /^\/Items\/([^/]+)\/Images\/(\w+)$/.exec(p);
      if (img) return route.fulfill({ status: 200, headers: cors, contentType: "image/png", body: art(imageFor(img[1], img[2], opts)) });
      if (/\/Trickplay\//.test(p)) return route.fulfill({ status: 200, headers: cors, contentType: "image/png", body: art("trick") });
      if (/^\/Videos\/[^/]+\/stream/.test(p)) return route.fulfill({ status: 200, headers: cors, contentType: "video/mp4", body: "" });
      if (/^\/MediaSegments\//.test(p)) {
        const items = opts.segments ?? [];
        return json({ Items: items, TotalRecordCount: items.length, StartIndex: 0 });
      }
      // The server stops the conversion it started (the desktop-only refusal cleans up).
      if (p === "/Videos/ActiveEncodings") return route.fulfill({ status: 204, headers: cors });
      if (p === "/Sessions/Logout") return route.fulfill({ status: 204, headers: cors });
      const info = /^\/Items\/([^/]+)\/PlaybackInfo$/.exec(p);
      if (info) {
        if (opts.playbackDelayMs) await sleep(opts.playbackDelayMs);
        const id = info[1];
        const dto = movies[id] ? movieDto(id, opts) : episodeDto(id, opts);
        let sources: Dto[] = dto.MediaSources;
        if (opts.disc && url.searchParams.get("EnableDirectPlay") === "false") sources = sources.map((s) => ({ ...s, SupportsDirectPlay: false }));
        if (opts.converted) {
          sources = sources.map((s) => ({
            ...s,
            SupportsDirectPlay: false,
            TranscodingSubProtocol: "hls",
            TranscodingUrl: `/videos/${id}/master.m3u8?MediaSourceId=${s.Id}&VideoCodec=h264&AudioCodec=aac&PlaySessionId=play-1&TranscodeReasons=ContainerBitrateExceedsLimit`,
          }));
        }
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
        if (id === "box-1") return json(boxSetDto());
        if (/^big-\d+$/.test(id)) return json(bigMovie(Number(id.slice(4)), opts));
        return missing();
      }
      if (opts.liveDelay?.rowsMs && ["/UserItems/Resume", "/Shows/NextUp", "/Items/Latest", "/UserViews"].includes(p)) await sleep(opts.liveDelay.rowsMs);
      if (opts.rowDelayMs && ["/UserItems/Resume", "/Shows/NextUp", "/Items/Latest", "/UserViews"].includes(p)) await sleep(opts.rowDelayMs);
      if (/^\/User(Played|Favorite)Items\//.test(p)) {
        if (opts.flagError) return route.fulfill({ status: 500, headers: cors });
        return json({});
      }
      if (p === "/Users/Configuration" && request.method() === "POST") {
        if (opts.configurationSave === "refuse") return route.fulfill({ status: 403, headers: cors });
        if (opts.configurationSave === "fail") return route.fulfill({ status: 500, headers: cors });
        configuration = request.postDataJSON() as Record<string, unknown>;
        opts.configurationLog?.push(configuration);
        return route.fulfill({ status: 204, headers: cors });
      }
      switch (p) {
        case "/Users/Me":
          if (opts.languagesDelayMs) await sleep(opts.languagesDelayMs);
          if (opts.languagesError) return route.fulfill({ status: 500, headers: cors });
          return json({ Id: "user-1", Name: "Sam", Configuration: configuration });
        case "/Localization/Cultures":
          return json(cultures());
        case "/System/Info/Public":
          return json({ ServerName: "Hearth", Version: "10.11.7", Id: "server-1" });
        case "/QuickConnect/Enabled":
          return json(!opts.noQuickConnect);
        case "/QuickConnect/Initiate":
          return json({ Secret: "s", Code: "482913", Authenticated: false });
        case "/QuickConnect/Connect":
          if (opts.quickConnectExpired) return route.fulfill({ status: 404, headers: cors });
          return json({ Secret: "s", Code: "482913", Authenticated: !opts.holdQuickConnect });
        case "/Users/AuthenticateWithQuickConnect":
          return json({ AccessToken: "test-token", User: { Id: "user-1", Name: "Sam" } });
        case "/Users/AuthenticateByName":
          return route.fulfill({ status: 401, headers: cors, contentType: "application/json", body: "{}" });
        case "/UserViews":
          return json({ Items: opts.empty ? [] : [
            { Id: "lib-movies", Name: "Movies", CollectionType: "movies", ImageTags: { Primary: "tag-lib1" } },
            { Id: "lib-shows", Name: "Shows", CollectionType: "tvshows", ImageTags: { Primary: "tag-lib2" } },
            ...(opts.manyLibraries ? MORE_LIBRARIES.map((Name) => ({ Id: `lib-${Name.toLowerCase().replace(/ /g, "-")}`, Name, CollectionType: "movies", ImageTags: { Primary: "tag-lib1" } })) : []),
          ] });
        case "/UserItems/Resume": {
          if (opts.empty || opts.homeLatestOnly) return json({ Items: [] });
          const old = opts.allAgedOut ? 60 : 0;
          const film = playedOn(movieDto("m2", opts), opts.agedOutFilm ? 30 : old + (opts.worstCaseArt ? 2 : 1));
          const inProgress = playedOn(episodeDto("ep-2"), old + (opts.worstCaseArt ? 1 : 2));
          const items = (opts.worstCaseArt ? [inProgress, film] : [film, inProgress]).filter((dto) => !finishedNow.has(dto.Id));
          return json({ Items: items });
        }
        case "/Shows/NextUp": {
          const seriesId = url.searchParams.get("seriesId") ?? url.searchParams.get("SeriesId");
          if (seriesId) {
            const mode = opts.seriesNextUp ?? "resume";
            if (seriesId !== "s1" || mode === "none") return json({ Items: [] });
            return json({ Items: [episodeDto(mode === "next" ? "ep-3" : "ep-2", opts)] });
          }
          if (opts.empty || opts.homeLatestOnly) return json({ Items: [] });
          return json({ Items: [addedLongAgo(episodeDto("ep-3")), addedLongAgo({ ...episodeDto("ep-1"), SeriesId: "s2", SeriesName: "Quiet Orbit", Name: "Perigee" })] });
        }
        case "/Items/Latest": {
          if (opts.empty) return json([]);
          const parent = url.searchParams.get("parentId") ?? url.searchParams.get("ParentId");
          if (parent === "lib-shows") {
            // Six series, so the row has more cards than the See all tile can be mistaken for.
            const shows = [seriesDto("s1"), seriesDto("s2")];
            return json([...shows, ...shows.map((m) => ({ ...m, Id: `${m.Id}-b` })), ...shows.map((m) => ({ ...m, Id: `${m.Id}-c` }))]);
          }
          const latest = ["m1", "m4", "m5", "m6", "m3", "m2"].filter((id) => !opts.hiddenFromLatest?.has(id)).map((id) => movieDto(id, opts));
          if (opts.longRows) return json([...latest, ...latest.map((m) => ({ ...m, Id: `${m.Id}-b` })), ...latest.map((m) => ({ ...m, Id: `${m.Id}-c` }))]);
          return json(latest);
        }
        case "/Genres":
          if (opts.genresError) return route.fulfill({ status: 500, headers: cors });
          return json(opts.noGenres ? { Items: [], TotalRecordCount: 0, StartIndex: 0 } : genresDto(url.searchParams.get("parentId"), movies, series));
        case "/Items": {
          // The viewer's finished films and episodes, newest first (Home dates next episodes by their series' last play).
          if (url.searchParams.get("sortBy") === "DatePlayed") {
            if (opts.empty || opts.homeLatestOnly) return json({ Items: [], TotalRecordCount: 0 });
            const done = (dto: Dto, days: number, extra: Dto = {}): Dto => ({ ...playedOn({ ...dto, ...extra }, days), UserData: { Played: true, LastPlayedDate: daysAgo(days) } });
            const entries = [
              ...[...finishedNow].map(([id, at]) => ({ ...episodeDto(id), UserData: { Played: true, LastPlayedDate: new Date(at).toISOString() } })),
              done(episodeDto("ep-1"), (opts.allAgedOut ? 60 : 0) + 3),
              done(episodeDto("ep-1"), (opts.allAgedOut ? 60 : 0) + 9, { Id: "ep-s2-1", SeriesId: "s2", SeriesName: "Quiet Orbit" }),
            ];
            return json({ Items: entries, TotalRecordCount: entries.length });
          }
          const term = url.searchParams.get("searchTerm");
          if (term) {
            if (opts.searchDelayMs) await sleep(opts.searchDelayMs);
            if (opts.searchError) return route.fulfill({ status: 500, headers: cors });
            if (opts.longSearch) {
              const many = Array.from({ length: LONG_SEARCH_COUNT }, (_, index) => ({ ...movieDto("m1", opts), Id: `m1-${index + 1}`, Name: `The Long Quiet ${index + 1}` }));
              const matching = many.filter((i) => i.Name.toLowerCase().includes(term.toLowerCase()));
              const startIndex = Number(url.searchParams.get("startIndex") ?? 0);
              const limit = Number(url.searchParams.get("limit") ?? matching.length);
              return json({ Items: matching.slice(startIndex, startIndex + limit), TotalRecordCount: matching.length, StartIndex: startIndex });
            }
            const all = [...Object.keys(movies).map((id) => movieDto(id, opts)), seriesDto("s1"), seriesDto("s2"), ...Object.keys(episodes).map((id) => episodeDto(id))];
            const found = all.filter((i) => i.Name.toLowerCase().includes(term.toLowerCase()));
            return json({ Items: found, TotalRecordCount: found.length });
          }
          const parent = url.searchParams.get("parentId");
          const start = Number(url.searchParams.get("startIndex") ?? 0);
          if (parent) {
            if (opts.libraryItemsDelayMs) await sleep(opts.libraryItemsDelayMs);
            if (opts.liveDelay?.libraryMs) await sleep(opts.liveDelay.libraryMs);
            if (opts.libraryItemsError || (opts.libraryPageError && start > 0)) return route.fulfill({ status: 500, headers: cors });
          }
          if (parent === "box-1") return json({ Items: [movieDto("m1", opts), movieDto("m4", opts)], TotalRecordCount: 2 });
          const genreIds = url.searchParams.get("genreIds");
          if (parent === "lib-shows") {
            const shows = filterByGenre([seriesDto("s1"), seriesDto("s2")], genreIds);
            return json({ Items: shows, TotalRecordCount: shows.length });
          }
          if (opts.bigLibrary && parent === "lib-movies") {
            const limit = Number(url.searchParams.get("limit") ?? 60);
            const page = Array.from({ length: Math.max(0, Math.min(limit, 150 - start)) }, (_, offset) => bigMovie(start + offset + 1, opts));
            return json({ Items: page, TotalRecordCount: 150 });
          }
          const list = Object.keys(movies).map((id) => movieDto(id, opts));
          let all = [...list, ...list.map((m) => ({ ...m, Id: `${m.Id}-b` })), ...list.map((m) => ({ ...m, Id: `${m.Id}-c` }))];
          all = filterByGenre(all, genreIds);
          const filters = (url.searchParams.get("filters") ?? "").split(",");
          if (filters.includes("IsFavorite")) all = all.filter((m) => m.UserData.IsFavorite);
          if (filters.includes("IsResumable")) all = all.filter((m) => m.UserData.PlaybackPositionTicks > 0);
          if (filters.includes("IsUnplayed")) all = all.filter((m) => !m.UserData.Played);
          return json({ Items: all, TotalRecordCount: all.length });
        }
        case "/Search/Hints": {
          const term = (url.searchParams.get("searchTerm") ?? "").toLowerCase();
          const hints = [
            ...Object.entries(movies).map(([Id, m]) => ({ Id, Name: m.Name, Type: "Movie", ProductionYear: m.ProductionYear, PrimaryImageTag: `tag-${Id}` })),
            ...Object.entries(series).map(([Id, s]) => ({ Id, Name: s.Name, Type: "Series", ProductionYear: s.ProductionYear, PrimaryImageTag: `tag-${Id}` })),
            ...Object.entries(episodes).map(([Id, e]) => ({
              Id, Name: e.Name, Type: "Episode", Series: "Harbor Lights", ParentIndexNumber: 1, IndexNumber: e.IndexNumber, ProductionYear: 2022, PrimaryImageTag: `tag-${Id}`,
            })),
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
