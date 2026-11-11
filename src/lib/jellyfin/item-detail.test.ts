import { describe, expect, it } from "vitest";
import { dynamicRangeOf, toItemDetail } from "./item-detail";
import type { BaseItemDto, MediaSourceDto } from "./types";

// Items recorded from Jellyfin 10.11.7 and 12.4.0 with the detail view's exact
// request, GET /Items/{id}?userId and no fields (tests/integration/record-fixtures.mjs).
const itemFixtures = import.meta.glob("../../../tests/fixtures/jellyfin/*/item-detail-no-fields-multi-version.json", {
  eager: true,
  import: "default",
}) as Record<string, BaseItemDto>;
const hdr10Fixtures = import.meta.glob("../../../tests/fixtures/jellyfin/*/item-detail-no-fields-hevc-hdr10.json", {
  eager: true,
  import: "default",
}) as Record<string, BaseItemDto>;

describe("toItemDetail with recorded items", () => {
  it.each(Object.entries(itemFixtures))("maps two named versions from %s", (_path, dto) => {
    const detail = toItemDetail(dto)!;
    expect(detail.title).toBe("Synthetic Versions (2024)");
    expect(detail.year).toBe(2024);
    expect(detail.userData).toEqual({ played: false, favorite: false, resumePositionTicks: 0 });
    expect(detail.versions.map((version) => [version.id, version.name])).toEqual([
      ["item-versions", "1080p"],
      ["source-versions-2", "720p"],
    ]);
    const [first, second] = detail.versions;
    expect(first.video).toMatchObject({ codec: "h264", profile: "High", width: 1920, height: 1080, bitDepth: 8, hdr: "SDR" });
    expect(second.video).toMatchObject({ width: 1280, height: 720 });
    expect(first.audio).toEqual([
      expect.objectContaining({ language: "eng", codec: "aac", channels: 2, channelLayout: "stereo", isDefault: false }),
    ]);
    expect(first.container).toBe("mkv");
    expect(first.sizeBytes).toBe(3250587);
  });

  it("finds the sources, streams, and user data without a fields parameter", () => {
    expect(Object.keys(itemFixtures)).toHaveLength(2);
    for (const dto of Object.values(itemFixtures)) {
      expect(dto.MediaSources?.[0]?.MediaStreams?.length).toBeGreaterThan(0);
      expect(dto.UserData).toBeDefined();
    }
  });

  it("keeps the series id of an episode", () => {
    const detail = toItemDetail({ Id: "e1", Name: "Pilot", Type: "Episode", SeriesId: "s1" })!;
    expect(detail.seriesId).toBe("s1");
    expect(toItemDetail({ Id: "m1", Name: "Film", Type: "Movie" })!.seriesId).toBeUndefined();
  });

  it("uses the primary image tag and its blurhash", () => {
    const detail = toItemDetail({
      Id: "m1",
      Name: "Film",
      ImageTags: { Primary: "p1" },
      ImageBlurHashes: { Primary: { p1: "LEHV6nWB2yk8pyo0adR*.7kCMdnj" } },
    })!;
    expect(detail.poster).toEqual({ itemId: "m1", type: "Primary", tag: "p1", blurHash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj" });
    expect(detail.backdrop).toBeUndefined();
  });

  it.each(Object.entries(hdr10Fixtures))("maps an HDR10 HEVC item from %s", (_path, dto) => {
    const detail = toItemDetail(dto)!;
    expect(detail.versions[0].video).toMatchObject({ codec: "hevc", profile: "Main 10", bitDepth: 10, hdr: "HDR10" });
  });
});

describe("endYear", () => {
  const series: BaseItemDto = { Id: "s1", Name: "Show", Type: "Series", ProductionYear: 2022 };

  it("maps the year of EndDate for a series", () => {
    expect(toItemDetail({ ...series, EndDate: "2024-11-01T00:00:00.0000000Z" })?.endYear).toBe(2024);
  });

  it("is absent for a movie, an invalid date, or a missing date", () => {
    expect(toItemDetail({ ...series, Type: "Movie", EndDate: "2024-11-01T00:00:00Z" })).not.toHaveProperty("endYear");
    expect(toItemDetail({ ...series, EndDate: "not a date" })).not.toHaveProperty("endYear");
    expect(toItemDetail(series)).not.toHaveProperty("endYear");
  });
});

describe("dynamicRangeOf", () => {
  it.each([
    [{ VideoRangeType: "SDR" }, "SDR"],
    [{ VideoRangeType: "HDR10" }, "HDR10"],
    [{ VideoRangeType: "HDR10Plus" }, "HDR10+"],
    [{ VideoRangeType: "HLG" }, "HLG"],
    [{ VideoRangeType: "DOVI" }, "Dolby Vision"],
    [{ VideoRangeType: "DOVIWithEL" }, "Dolby Vision"],
    [{ VideoRangeType: "DOVIWithHDR10" }, "Dolby Vision / HDR10"],
    [{ VideoRangeType: "DOVIWithHDR10Plus" }, "Dolby Vision / HDR10+"],
    [{ VideoRangeType: "DOVIWithELHDR10Plus" }, "Dolby Vision / HDR10+"],
    [{ VideoRangeType: "DOVIWithHLG" }, "Dolby Vision / HLG"],
    [{ VideoRangeType: "DOVIWithSDR" }, "Dolby Vision / SDR"],
    [{ VideoRangeType: "Unknown", ColorTransfer: "smpte2084" }, "HDR10"],
    [{ ColorTransfer: "arib-std-b67" }, "HLG"],
    [{ VideoRangeType: "Unknown", VideoRange: "HDR" }, "HDR"],
    [{ VideoRange: "SDR" }, "SDR"],
    [{}, "Unknown"],
  ])("maps %j to %s", (stream, expected) => {
    expect(dynamicRangeOf(stream)).toBe(expected);
  });
});

describe("toItemDetail", () => {
  const source: MediaSourceDto = {
    Id: "src-1",
    Name: "Director's Cut",
    Container: "mkv",
    MediaStreams: [
      { Index: 0, Type: "Video", Codec: "hevc", VideoRangeType: "DOVIWithHDR10", Width: 3840, Height: 2160 },
      { Index: 1, Type: "Audio", Codec: "truehd", Channels: 8, Language: "eng", IsDefault: true },
      { Index: 2, Type: "Subtitle", Codec: "subrip", Language: "fra", IsExternal: true, IsForced: true },
      { Index: 3, Type: "Subtitle", Codec: "pgssub", Language: "eng", IsDefault: true },
    ],
  };

  it("maps audio and subtitle streams with their flags", () => {
    const detail = toItemDetail({ Id: "m1", Name: "Film", Type: "Movie", MediaSources: [source] })!;
    expect(detail.versions[0].video?.hdr).toBe("Dolby Vision / HDR10");
    expect(detail.versions[0].audio).toEqual([{ language: "eng", codec: "truehd", channels: 8, isDefault: true }]);
    expect(detail.versions[0].subtitles).toEqual([
      { language: "fra", codec: "subrip", isExternal: true, isDefault: false, isForced: true },
      { language: "eng", codec: "pgssub", isExternal: false, isDefault: true, isForced: false },
    ]);
  });

  it("names unnamed versions by position and skips sources without an ID", () => {
    const detail = toItemDetail({ Id: "m1", Name: "Film", MediaSources: [{ Id: "a" }, { Name: "no id" }, { Id: "b" }] })!;
    expect(detail.versions.map((version) => version.name)).toEqual(["Version 1", "Version 3"]);
  });

  it("maps an episode, genres, top-billed cast, and user data", () => {
    const detail = toItemDetail({
      Id: "e1",
      Name: "Pilot",
      Type: "Episode",
      SeriesName: "Show",
      SeasonId: "se1",
      SeasonName: "Season 1",
      ParentIndexNumber: 1,
      IndexNumber: 2,
      Genres: ["Drama"],
      People: [
        { Name: "Director", Type: "Director" },
        { Name: "Ann", Role: "Lead", Type: "Actor" },
      ],
      BackdropImageTags: ["bd"],
      UserData: { Played: true, IsFavorite: true, PlaybackPositionTicks: 50 },
    })!;
    expect(detail).toMatchObject({
      seriesName: "Show",
      seasonId: "se1",
      seasonName: "Season 1",
      seasonNumber: 1,
      episodeNumber: 2,
      genres: ["Drama"],
      cast: [{ name: "Ann", role: "Lead" }],
      userData: { played: true, favorite: true, resumePositionTicks: 50 },
      backdrop: { itemId: "e1", type: "Backdrop", tag: "bd" },
    });
  });

  it("sets the season and episode numbers only when both are present, and none for a movie", () => {
    const half = toItemDetail({ Id: "e1", Name: "Pilot", Type: "Episode", IndexNumber: 2 })!;
    expect(half).not.toHaveProperty("seasonNumber");
    expect(half).not.toHaveProperty("episodeNumber");
    expect(half).not.toHaveProperty("seasonId");
    const movie = toItemDetail({ Id: "m1", Name: "Film", Type: "Movie", ParentIndexNumber: 1, IndexNumber: 2, SeasonId: "x" })!;
    expect(movie).not.toHaveProperty("seasonNumber");
    expect(movie).not.toHaveProperty("seasonId");
  });

  it("returns undefined without an ID or name", () => {
    expect(toItemDetail({ Name: "x" })).toBeUndefined();
    expect(toItemDetail({ Id: "x" })).toBeUndefined();
  });
});

describe("trickplay and chapters", () => {
  const info = (width: number) => ({ Width: width, Height: width / 2, TileWidth: 10, TileHeight: 10, ThumbnailCount: 100, Interval: 10000 });
  const base: BaseItemDto = { Id: "i", Name: "N", MediaSources: [{ Id: "a" }, { Id: "b" }] as MediaSourceDto[] };

  it("recorded no-fields fixtures carry empty Trickplay and Chapters and map to no previews", () => {
    for (const dto of [...Object.values(itemFixtures), ...Object.values(hdr10Fixtures)]) {
      expect(dto).toHaveProperty("Trickplay");
      expect(dto).toHaveProperty("Chapters");
      const detail = toItemDetail(dto)!;
      expect(detail.chapters).toBeUndefined();
      expect(detail.versions.every((version) => version.trickplay === undefined)).toBe(true);
    }
  });

  it("maps per version and picks the width closest to 320", () => {
    const detail = toItemDetail({ ...base, Trickplay: { a: { "200": info(200), "360": info(360), "1080": info(1080) }, b: { "480": info(480) } } })!;
    expect(detail.versions[0].trickplay).toEqual({ width: 360, height: 180, tileWidth: 10, tileHeight: 10, thumbnailCount: 100, intervalMs: 10000 });
    expect(detail.versions[1].trickplay?.width).toBe(480);
  });

  it("ignores incomplete tile layouts and versions without trickplay", () => {
    const detail = toItemDetail({ ...base, Trickplay: { a: { "320": { ...info(320), Interval: 0 } } } })!;
    expect(detail.versions.map((version) => version.trickplay)).toEqual([undefined, undefined]);
  });

  it("maps chapters in order with fallback names", () => {
    const detail = toItemDetail({
      ...base,
      Chapters: [{ StartPositionTicks: 600_000_000, Name: "Second" }, { StartPositionTicks: 0, Name: "First" }, { StartPositionTicks: 1_200_000_000, Name: " " }],
    })!;
    expect(detail.chapters).toEqual([
      { startSeconds: 0, name: "First" },
      { startSeconds: 60, name: "Second" },
      { startSeconds: 120, name: "Chapter 3" },
    ]);
  });
});
