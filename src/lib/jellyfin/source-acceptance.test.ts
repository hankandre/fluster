import { describe, expect, it } from "vitest";
import { decideSource, selectSource, type SourceContext } from "./source-acceptance";
import type { MediaSourceDto } from "./types";

const ITEM = "0123456789abcdef0123456789abcdef";
const context: SourceContext = { serverUrl: "https://media.test", itemId: ITEM };

const playable: MediaSourceDto = {
  Id: "source-1",
  Path: "/media/movie.mkv",
  Protocol: "File",
  VideoType: "VideoFile",
  SupportsDirectPlay: true,
};

// A server remux of an H.264/AAC file: the shape StreamBuilder writes when it
// copies the audio stream (AudioCodec narrowed to the source codec).
function hlsUrl(query: string, path = `/videos/${ITEM}/master.m3u8`): string {
  return `${path}?DeviceId=d&MediaSourceId=source-1&VideoCodec=h264,hevc,av1,vp9&${query}&PlaySessionId=p&ApiKey=secret-key`;
}

const remux: MediaSourceDto = {
  Id: "source-1",
  Path: "/media/movie.avi",
  Protocol: "File",
  VideoType: "VideoFile",
  SupportsDirectPlay: false,
  TranscodingSubProtocol: "hls",
  TranscodingUrl: hlsUrl("AudioCodec=aac&AudioStreamIndex=1&TranscodeReasons=ContainerNotSupported"),
  MediaStreams: [
    { Index: 0, Type: "Video", Codec: "h264" },
    { Index: 1, Type: "Audio", Codec: "aac" },
  ],
};

describe("decideSource", () => {
  it("direct plays a file source with no TranscodingUrl", () => {
    expect(decideSource(playable, context)).toMatchObject({ kind: "direct-play", source: { Id: "source-1", Path: "/media/movie.mkv" } });
  });

  it.each([
    [{ Id: undefined }, "missing-source-data"],
    [{ Id: undefined, RequiresOpening: true }, "missing-source-data"],
    [{ RequiresOpening: true }, "live-source"],
    [{ RequiresOpening: true, TranscodingUrl: remux.TranscodingUrl, TranscodingSubProtocol: "hls" }, "live-source"],
    [{ Protocol: "Http" }, "not-a-file"],
    [{ Protocol: undefined }, "not-a-file"],
    [{ Path: undefined }, "missing-source-data"],
    [{ SupportsDirectPlay: false }, "conversion-not-allowed"],
    [{ SupportsDirectPlay: undefined }, "conversion-not-allowed"],
    [{ SupportsDirectPlay: false, VideoType: "BluRay" }, "conversion-not-allowed"],
  ] as const)("refuses %o as %s", (change, reason) => {
    expect(decideSource({ ...playable, ...change }, context)).toMatchObject({ kind: "refused", reason });
  });

  it.each([
    [{ VideoType: "BluRay" }, "disc-source"],
    [{ VideoType: "Dvd" }, "disc-source"],
    [{ VideoType: "bluray" }, "disc-source"],
    [{ VideoType: "DVD" }, "disc-source"],
    [{ VideoType: "Iso" }, "iso-source"],
    [{ VideoType: "ISO" }, "iso-source"],
    [{ VideoType: "VideoFile", Path: "/media/Movie (2024)/BDMV/STREAM/00000.m2ts" }, "disc-source"],
    [{ VideoType: "VideoFile", Path: "/media/Movie (2024)/bdmv" }, "disc-source"],
    [{ VideoType: undefined, Path: "/media/Movie (2024)/VIDEO_TS/VTS_01_1.VOB" }, "disc-source"],
    [{ VideoType: undefined, Path: "D:\\Movies\\Movie\\VIDEO_TS" }, "disc-source"],
    [{ VideoType: "VideoFile", Path: "/media/Movie (2024)/Movie.ISO" }, "iso-source"],
  ] as const)("never direct plays the disc %o and asks for the forced fallback", (change, reason) => {
    expect(decideSource({ ...playable, ...change }, context)).toEqual({
      kind: "force-fallback",
      source: expect.objectContaining({ Id: "source-1" }),
      reason,
    });
  });

  it("does not treat a name that merely contains BDMV or .iso as a disc", () => {
    expect(decideSource({ ...playable, Path: "/media/BDMV Collection/Movie.mkv" }, context).kind).toBe("direct-play");
    expect(decideSource({ ...playable, Path: "/media/Movie.iso.mkv" }, context).kind).toBe("direct-play");
    expect(decideSource({ ...playable, RequiresOpening: false }, context).kind).toBe("direct-play");
  });

  it("converts a disc the server offers to convert, never playing it directly", () => {
    const disc = { ...remux, VideoType: "BluRay", SupportsDirectPlay: true, Path: "/media/Disc" };
    expect(decideSource(disc, context)).toMatchObject({ kind: "convert" });
  });

  it("uses a server conversion when it also offers direct play with a TranscodingUrl", () => {
    expect(decideSource({ ...remux, SupportsDirectPlay: true }, context)).toMatchObject({ kind: "convert" });
  });

  it("calls a conversion DirectStream only when the server copies video and audio", () => {
    const decision = decideSource(remux, context);
    expect(decision).toMatchObject({
      kind: "convert",
      playMethod: "DirectStream",
      conversionReasons: ["ContainerNotSupported"],
    });
    if (decision.kind !== "convert") throw new Error("expected a conversion");
    expect(decision.masterUrl).not.toContain("secret-key");
  });

  it("uses the source's default audio stream when the URL names none", () => {
    const query = "AudioCodec=aac&TranscodeReasons=VideoCodecTagNotSupported";
    expect(decideSource({ ...remux, TranscodingUrl: hlsUrl(query), DefaultAudioStreamIndex: 1 }, context)).toMatchObject({ playMethod: "DirectStream" });
    expect(decideSource({ ...remux, TranscodingUrl: hlsUrl(query) }, context)).toMatchObject({ playMethod: "Transcode" });
  });

  it.each([
    ["no TranscodeReasons, as for the BluRay folder", "AudioCodec=aac&AudioStreamIndex=1"],
    ["a bitrate reason", "AudioCodec=aac&AudioStreamIndex=1&TranscodeReasons=ContainerBitrateExceedsLimit"],
    ["a forced-fallback reason", "AudioCodec=aac&AudioStreamIndex=1&TranscodeReasons=DirectPlayError"],
    ["12.4's AudioCodecNotSupported", "AudioCodec=aac&AudioStreamIndex=1&TranscodeReasons=AudioCodecNotSupported,ContainerNotSupported"],
    ["an unknown reason", "AudioCodec=aac&AudioStreamIndex=1&TranscodeReasons=ContainerNotSupported,SomethingNew"],
    ["the profile's audio list instead of the source codec", "AudioCodec=aac,ac3,eac3,opus,flac,mp3&AudioStreamIndex=1&TranscodeReasons=ContainerNotSupported"],
    ["another audio codec", "AudioCodec=ac3&AudioStreamIndex=1&TranscodeReasons=ContainerNotSupported"],
    ["burned-in subtitles", "AudioCodec=aac&AudioStreamIndex=1&SubtitleMethod=Encode&TranscodeReasons=ContainerNotSupported"],
  ])("labels a conversion Transcode for %s", (_case, query) => {
    expect(decideSource({ ...remux, TranscodingUrl: hlsUrl(query) }, context)).toMatchObject({ kind: "convert", playMethod: "Transcode" });
  });

  it("labels a conversion Transcode when the video codec is not in the URL's list", () => {
    const vc1 = { ...remux, MediaStreams: [{ Index: 0, Type: "Video", Codec: "vc1" }, { Index: 1, Type: "Audio", Codec: "aac" }] };
    expect(decideSource(vc1, context)).toMatchObject({ playMethod: "Transcode" });
  });

  it("labels a conversion Transcode when the source streams are unknown", () => {
    expect(decideSource({ ...remux, MediaStreams: [] }, context)).toMatchObject({ playMethod: "Transcode" });
  });

  it("keeps only known Jellyfin reasons on the plan", () => {
    const decision = decideSource({ ...remux, TranscodingUrl: hlsUrl("AudioCodec=aac&TranscodeReasons=ContainerBitrateExceedsLimit,SomethingNew") }, context);
    expect(decision).toMatchObject({ conversionReasons: ["ContainerBitrateExceedsLimit"] });
  });

  it.each([
    ["a progressive (non-HLS) conversion", { TranscodingSubProtocol: "http" }, "not HLS"],
    ["a missing sub-protocol", { TranscodingSubProtocol: undefined }, "not HLS"],
    ["another origin", { TranscodingUrl: `https://evil.test/videos/${ITEM}/master.m3u8?ApiKey=x` }, "other origin"],
    ["another item", { TranscodingUrl: hlsUrl("AudioCodec=aac", "/videos/ffffffffffffffffffffffffffffffff/master.m3u8") }, "item"],
    ["another media source", { TranscodingUrl: `/videos/${ITEM}/master.m3u8?MediaSourceId=other` }, "media source"],
    ["SubtitleMethod=Hls", { TranscodingUrl: hlsUrl("SubtitleMethod=Hls") }, "HLS subtitles"],
  ])("refuses %s as unsafe-transcoding-url", (_case, change, detail) => {
    expect(decideSource({ ...remux, ...change }, context)).toEqual({ kind: "refused", reason: "unsafe-transcoding-url", detail });
  });
});

describe("selectSource", () => {
  it("refuses an empty source list", () => {
    expect(selectSource([], context)).toMatchObject({ kind: "refused", reason: "no-sources" });
    expect(selectSource(undefined, context)).toMatchObject({ kind: "refused", reason: "no-sources" });
    expect(selectSource(null, context)).toMatchObject({ kind: "refused", reason: "no-sources" });
  });

  it("prefers DirectPlay, then DirectStream, then Transcode, then the forced fallback", () => {
    const withSource = (id: string, query: string) => ({ ...remux, Id: id, TranscodingUrl: hlsUrl(query).replace("MediaSourceId=source-1", `MediaSourceId=${id}`) });
    const transcode = withSource("transcode", "AudioCodec=aac&AudioStreamIndex=1&TranscodeReasons=DirectPlayError");
    const directStream = withSource("remux", "AudioCodec=aac&AudioStreamIndex=1&TranscodeReasons=ContainerNotSupported");
    const iso = { ...playable, Id: "iso", VideoType: "Iso" };
    const refused = { ...playable, Id: "refused", RequiresOpening: true };
    const file = { ...playable, Id: "file" };
    expect(selectSource([refused, iso, transcode, directStream, file], context)).toMatchObject({ kind: "direct-play", source: { Id: "file" } });
    expect(selectSource([refused, iso, transcode, directStream], context)).toMatchObject({ playMethod: "DirectStream", source: { Id: "remux" } });
    expect(selectSource([refused, iso, transcode], context)).toMatchObject({ playMethod: "Transcode", source: { Id: "transcode" } });
    expect(selectSource([refused, iso], context)).toMatchObject({ kind: "force-fallback", source: { Id: "iso" } });
  });

  it("explains a total refusal with the first refusal", () => {
    const decision = selectSource([
      { ...playable, Id: "live", RequiresOpening: true },
      { ...playable, Id: "limited", SupportsDirectPlay: false },
    ], context);
    expect(decision).toEqual({ kind: "refused", reason: "live-source" });
  });

  it("never replaces a requested version with another one", () => {
    const sources = [
      { ...playable, Id: "first" },
      { ...playable, Id: "second", SupportsDirectPlay: false },
    ];
    expect(selectSource(sources, context, "second")).toMatchObject({ kind: "refused", reason: "conversion-not-allowed" });
    expect(selectSource(sources, context, "third")).toMatchObject({ kind: "refused", reason: "no-sources" });
    expect(selectSource(sources, context, "first")).toMatchObject({ kind: "direct-play", source: { Id: "first" } });
  });
});
