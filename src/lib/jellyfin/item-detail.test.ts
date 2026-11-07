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
      episodeLabel: "Season 1, Episode 2",
      genres: ["Drama"],
      cast: [{ name: "Ann", role: "Lead" }],
      userData: { played: true, favorite: true, resumePositionTicks: 50 },
      backdrop: { itemId: "e1", type: "Backdrop", tag: "bd" },
    });
  });

  it("returns undefined without an ID or name", () => {
    expect(toItemDetail({ Name: "x" })).toBeUndefined();
    expect(toItemDetail({ Id: "x" })).toBeUndefined();
  });
});
