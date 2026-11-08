import { describe, expect, it } from "vitest";
import {
  checkConversionPlan,
  checkHlsRequest,
  checkJobGone,
  checkMediaRequest,
  checkSessionAgreement,
  classifyProcess,
  decideStatus,
  findCredentialInBody,
  findTranscodeLogFiles,
  findTranscodeLogLines,
  findTranscodingSessions,
  playlistUris,
  type Expectation,
} from "./tripwire-rules";

const base = "http://127.0.0.1:18096";

describe("checkMediaRequest", () => {
  it("accepts a static stream URL", () => {
    const result = checkMediaRequest(`${base}/Videos/abc123/stream?Static=true&MediaSourceId=abc123&PlaySessionId=p&api_key=t`);
    expect(result).toEqual({ ok: true, kind: "stream" });
  });

  it("accepts an external subtitle URL", () => {
    const result = checkMediaRequest(`${base}/Videos/abc/def/Subtitles/2/0/Stream.srt?api_key=t`);
    expect(result).toEqual({ ok: true, kind: "subtitle" });
  });

  it("rejects a stream URL without Static=true", () => {
    expect(checkMediaRequest(`${base}/Videos/abc/stream?MediaSourceId=abc`).ok).toBe(false);
    expect(checkMediaRequest(`${base}/Videos/abc/stream?Static=false`).ok).toBe(false);
  });

  it("checks the Static parameter case-sensitively", () => {
    expect(checkMediaRequest(`${base}/Videos/abc/stream?static=true`).ok).toBe(false);
    expect(checkMediaRequest(`${base}/Videos/abc/stream?STATIC=true`).ok).toBe(false);
    expect(checkMediaRequest(`${base}/Videos/abc/stream?Static=True`).ok).toBe(false);
  });

  it("requires exactly one static key", () => {
    expect(checkMediaRequest(`${base}/Videos/abc/stream?static=false&Static=true`).ok).toBe(false);
    expect(checkMediaRequest(`${base}/Videos/abc/stream?Static=true&static=false`).ok).toBe(false);
    expect(checkMediaRequest(`${base}/Videos/abc/stream?Static=true&Static=true`).ok).toBe(false);
    expect(checkMediaRequest(`${base}/Videos/abc/stream?Static=true&Static=false`).ok).toBe(false);
  });

  it("rejects HLS and transcoding URLs even with Static=true", () => {
    for (const path of [
      "/Videos/abc/master.m3u8?Static=true",
      "/Videos/abc/main.m3u8?Static=true",
      "/Videos/abc/hls1/main/0.ts?Static=true",
      "/Videos/abc/stream.mkv?Static=true&TranscodingUrl=x",
      "/Audio/abc/universal?Static=true",
    ]) {
      const result = checkMediaRequest(`${base}${path}`);
      expect(result.ok, path).toBe(false);
      expect(result.reason, path).toBeTruthy();
    }
  });

  it("rejects a stream URL with an extension or extra path", () => {
    expect(checkMediaRequest(`${base}/Videos/abc/stream.ts?Static=true`).ok).toBe(false);
  });
});

describe("classifyProcess", () => {
  it("separates ffprobe from ffmpeg", () => {
    expect(classifyProcess("/usr/lib/jellyfin-ffmpeg/ffprobe -i /media/a.mkv")).toBe("ffprobe");
    expect(classifyProcess("/usr/lib/jellyfin-ffmpeg/ffmpeg -i /media/a.mkv -f hls x")).toBe("ffmpeg");
    expect(classifyProcess("ffmpeg -version")).toBe("ffmpeg");
    expect(classifyProcess("/jellyfin/jellyfin")).toBe("other");
    expect(classifyProcess("sh -c for p in /proc/[0-9]*; do ffmpeg; done")).toBe("other");
  });
});

describe("findTranscodeLogLines", () => {
  it("finds the TranscodeManager command-line log line", () => {
    const text = [
      "[2026-11-07 22:14:00.000 +00:00] [INF] [12] Main: Startup complete",
      "[2026-11-07 22:15:00.000 +00:00] [INF] [40] MediaBrowser.MediaEncoding.Transcoding.TranscodeManager: /usr/lib/jellyfin-ffmpeg/ffmpeg -analyzeduration 200M -i file:\"/media/a.mkv\" -f hls",
      "[2026-11-07 22:15:01.000 +00:00] [INF] [41] MediaBrowser.MediaEncoding.Encoder.MediaEncoder: Starting /usr/lib/jellyfin-ffmpeg/ffprobe with args",
      // Serilog quotes string arguments; this is the line Jellyfin 10.11.7 wrote in the sabotage run.
      "[2026-11-07 22:27:05.996 +00:00] [INF] [10] MediaBrowser.MediaEncoding.Transcoding.TranscodeManager: \"/usr/lib/jellyfin-ffmpeg/ffmpeg\" \"-analyzeduration 200M -probesize 1G -fflags +genpts\"",
      "[2026-11-07 22:14:21.431 +00:00] [INF] [16] MediaBrowser.MediaEncoding.Encoder.MediaEncoder: FFmpeg: \"/usr/lib/jellyfin-ffmpeg/ffmpeg\"",
    ].join("\n");
    const lines = findTranscodeLogLines(text);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("TranscodeManager");
  });
});

describe("findTranscodeLogFiles", () => {
  it("finds per-job FFmpeg log files", () => {
    const names = [
      "log_20261107.log",
      "FFmpeg.Transcode-2026-11-07_22-15-00_abc_1234abcd.log",
      "FFmpeg.Remux-2026-11-07_22-15-00_abc_1234abcd.log",
      "FFmpeg.DirectStream-2026-11-07_22-15-00_abc_1234abcd.log",
    ];
    expect(findTranscodeLogFiles(names)).toEqual(names.slice(1));
  });
});

describe("findTranscodingSessions", () => {
  it("flags sessions with TranscodingInfo or a non-direct play method", () => {
    const sessions = [
      { Id: "a", PlayState: { PlayMethod: "DirectPlay" } },
      { Id: "b", TranscodingInfo: { IsVideoDirect: false } },
      { Id: "c", PlayState: { PlayMethod: "DirectStream" } },
      { Id: "d", TranscodingInfo: null },
    ];
    expect(findTranscodingSessions(sessions).map((s) => s.id)).toEqual(["b", "c"]);
  });
});

describe("decideStatus", () => {
  const direct: Expectation = { kind: "direct-play" };
  const conversion: Expectation = { kind: "conversion", methods: ["DirectStream", "Transcode"] };
  const refused: Expectation = { kind: "refused", reason: "conversion-not-allowed" };
  const played = { expect: direct, failures: [], mediaRequests: 2, delivery: "static" as const };

  it("passes a clean direct play", () => {
    expect(decideStatus(played)).toEqual({ status: "PASS" });
  });

  it("fails on any recorded failure", () => {
    expect(decideStatus({ ...played, failures: ["I1: ffmpeg process"] }).status).toBe("FAIL");
    expect(decideStatus({ ...played, failures: ["oracle: docker exec failed"] }).status).toBe("FAIL");
  });

  it("fails a playable sample that converts", () => {
    const result = decideStatus({ expect: direct, failures: [], mediaRequests: 0, delivery: "hls" });
    expect(result.status).toBe("FAIL");
    expect(result.extraFailure).toMatch(/^I1: a playable sample must direct play, got a hls plan/);
  });

  it("fails an unexpected refusal", () => {
    for (const expectation of [direct, conversion]) {
      const result = decideStatus({ expect: expectation, failures: [], mediaRequests: 0, refusal: "conversion-not-allowed" });
      expect(result.status).toBe("FAIL");
      expect(result.extraFailure).toContain("conversion-not-allowed");
    }
  });

  it("passes a clean conversion as CONVERTED and fails one that direct plays", () => {
    expect(decideStatus({ expect: conversion, failures: [], mediaRequests: 5, delivery: "hls" })).toEqual({ status: "CONVERTED" });
    expect(decideStatus({ expect: conversion, failures: ["I2: credential parameter ApiKey"], mediaRequests: 5, delivery: "hls" }).status).toBe("FAIL");
    const directPlayed = decideStatus({ expect: conversion, failures: [], mediaRequests: 2, delivery: "static" });
    expect(directPlayed.status).toBe("FAIL");
    expect(directPlayed.extraFailure).toContain("expected a conversion");
  });

  it("accepts only the declared refusal reason with no media request", () => {
    expect(decideStatus({ expect: refused, failures: [], mediaRequests: 0, refusal: "conversion-not-allowed" })).toEqual({ status: "EXPECTED-REFUSED" });
    expect(decideStatus({ expect: refused, failures: [], mediaRequests: 0, refusal: "disc-source" }).status).toBe("FAIL");
    expect(decideStatus({ expect: refused, failures: [], mediaRequests: 1, refusal: "conversion-not-allowed" }).status).toBe("FAIL");
  });

  it("fails when an expected refusal does not happen", () => {
    const result = decideStatus({ expect: refused, failures: [], mediaRequests: 0, delivery: "hls" });
    expect(result.status).toBe("FAIL");
    expect(result.extraFailure).toContain("got a hls plan");
  });

  it("still fails an expected refusal that had other failures", () => {
    expect(decideStatus({ expect: refused, failures: ["I1: ffmpeg"], mediaRequests: 0, refusal: "conversion-not-allowed" }).status).toBe("FAIL");
  });
});

describe("checkHlsRequest", () => {
  const query = "?MediaSourceId=abc&PlaySessionId=p&EnableTrickplay=false";

  it("accepts same-origin master, variant, and segment requests", () => {
    expect(checkHlsRequest(`${base}/videos/abc/master.m3u8${query}`, base)).toEqual({ ok: true, kind: "master" });
    expect(checkHlsRequest(`${base}/videos/abc/main.m3u8${query}`, base)).toEqual({ ok: true, kind: "variant" });
    expect(checkHlsRequest(`${base}/videos/abc/hls1/main/0.mp4${query}`, base)).toEqual({ ok: true, kind: "segment" });
    expect(checkHlsRequest(`${base}/videos/abc/hls1/main/-1.mp4${query}`, base)).toEqual({ ok: true, kind: "segment" });
    expect(checkHlsRequest(`${base}/Videos/abc/Hls1/main/3.ts${query}`, base)).toEqual({ ok: true, kind: "segment" });
  });

  it("honours a server base path", () => {
    const server = "https://media.test/jellyfin";
    expect(checkHlsRequest(`${server}/videos/abc/master.m3u8${query}`, server).ok).toBe(true);
    expect(checkHlsRequest(`https://media.test/videos/abc/master.m3u8${query}`, server).ok).toBe(false);
  });

  it("fails a request with a credential parameter in any case", () => {
    for (const name of ["ApiKey", "api_key", "API_KEY", "access_token", "Token", "X-Emby-Token", "%20apikey", "Api%4Bey"]) {
      const result = checkHlsRequest(`${base}/videos/abc/main.m3u8${query}&${name}=secret`, base);
      expect(result.ok, name).toBe(false);
      expect(result.reason, name).toMatch(/^credential parameter/);
    }
  });

  it("fails a request without EnableTrickplay=false", () => {
    expect(checkHlsRequest(`${base}/videos/abc/master.m3u8?MediaSourceId=abc`, base).reason).toBe("no EnableTrickplay=false parameter");
    expect(checkHlsRequest(`${base}/videos/abc/master.m3u8?EnableTrickplay=true`, base).reason).toBe("EnableTrickplay=true");
    expect(checkHlsRequest(`${base}/videos/abc/master.m3u8?EnableTrickplay=false&enabletrickplay=true`, base).ok).toBe(false);
    expect(checkHlsRequest(`${base}/videos/abc/hls1/main/0.mp4?EnableTrickplay=1`, base).ok).toBe(false);
  });

  it("fails cross-origin, user info, static, and other paths", () => {
    for (const url of [
      `http://127.0.0.1:9999/videos/abc/master.m3u8${query}`,
      `https://127.0.0.1:18096/videos/abc/master.m3u8${query}`,
      `http://user:pw@127.0.0.1:18096/videos/abc/master.m3u8${query}`,
      `${base}/videos/abc/live.m3u8${query}`,
      `${base}/videos/abc/stream${query}&Static=true`,
      `${base}/videos/abc/master.m3u8${query}&Static=true`,
      `${base}/Videos/abc/Trickplay/320/tiles.m3u8${query}`,
      `${base}/videos/abc/abc/Subtitles/2/0/Stream.vtt${query}`,
      `${base}/Audio/abc/universal${query}`,
    ]) {
      expect(checkHlsRequest(url, base).ok, url).toBe(false);
    }
  });
});

describe("playlistUris and findCredentialInBody", () => {
  const master = [
    "#EXTM3U",
    '#EXT-X-STREAM-INF:BANDWIDTH=1,CODECS="avc1.640029"',
    "main.m3u8?EnableTrickplay=false",
    "",
  ].join("\n");
  const variant = [
    "#EXTM3U",
    '#EXT-X-MAP:URI="hls1/main/-1.mp4?EnableTrickplay=false"',
    "#EXTINF:6.0, nodesc",
    "hls1/main/0.mp4?EnableTrickplay=false",
    "#EXT-X-ENDLIST",
  ].join("\n");

  it("lists plain URI lines and URI attributes", () => {
    expect(playlistUris(master)).toEqual(["main.m3u8?EnableTrickplay=false"]);
    expect(playlistUris(variant)).toEqual(["hls1/main/-1.mp4?EnableTrickplay=false", "hls1/main/0.mp4?EnableTrickplay=false"]);
  });

  it("finds a credential parameter anywhere in a playlist body", () => {
    expect(findCredentialInBody(master)).toBeUndefined();
    expect(findCredentialInBody(variant)).toBeUndefined();
    expect(findCredentialInBody(`${master}#EXT-X-IMAGE-STREAM-INF:URI="Trickplay/320/tiles.m3u8?MediaSourceId=a&ApiKey=secret"\n`)).toBe("ApiKey");
    expect(findCredentialInBody("#EXT-X-MEDIA:URI=\"subtitles.m3u8?api_key=x\"")).toBe("api_key");
  });
});

describe("checkConversionPlan", () => {
  const either: Extract<Expectation, { kind: "conversion" }> = { kind: "conversion", methods: ["DirectStream", "Transcode"] };
  const limited: Extract<Expectation, { kind: "conversion" }> = {
    kind: "conversion",
    methods: ["Transcode"],
    reasonsAnyOf: ["ContainerBitrateExceedsLimit", "VideoBitrateNotSupported"],
  };

  it("accepts a disc conversion with no server reason when the indicator falls back", () => {
    const plan = { playMethod: "Transcode", conversionReasons: [], indicatorReasons: ["the server needs to convert this file"] };
    expect(checkConversionPlan(plan, either)).toEqual([]);
  });

  it("fails a plan without an indicator reason", () => {
    expect(checkConversionPlan({ playMethod: "Transcode", conversionReasons: [], indicatorReasons: [] }, either)).toEqual(["method: the conversion indicator has no reason"]);
  });

  it("requires a bitrate reason and the Transcode method for a forced limit", () => {
    const good = { playMethod: "Transcode", conversionReasons: ["AudioCodecNotSupported", "ContainerBitrateExceedsLimit"], indicatorReasons: ["x"] };
    expect(checkConversionPlan(good, limited)).toEqual([]);
    expect(checkConversionPlan({ ...good, conversionReasons: ["AudioCodecNotSupported"] }, limited)[0]).toMatch(/include none of/);
    expect(checkConversionPlan({ ...good, playMethod: "DirectStream" }, limited)[0]).toMatch(/plan method DirectStream/);
  });
});

describe("checkSessionAgreement", () => {
  const copied = { playMethod: "Transcode", transcoding: { isVideoDirect: true, isAudioDirect: true } };
  const encoded = { playMethod: "Transcode", transcoding: { isVideoDirect: false, isAudioDirect: false } };

  it("accepts a DirectStream confirmation the server copies and a Transcode one it re-encodes, both reported as Transcode", () => {
    expect(checkSessionAgreement("DirectStream", [copied], true)).toEqual([]);
    expect(checkSessionAgreement("Transcode", [encoded], true)).toEqual([]);
    expect(checkSessionAgreement("Transcode", [{ playMethod: "Transcode", transcoding: { isVideoDirect: true, isAudioDirect: false } }], true)).toEqual([]);
  });

  it("ignores polls before the confirmed report and needs audio only when the source has audio", () => {
    expect(checkSessionAgreement("DirectStream", [{ at: 1, playMethod: "DirectPlay" }, { ...copied, at: 2 }], true, 2)).toEqual([]);
    expect(checkSessionAgreement("DirectStream", [{ playMethod: "Transcode", transcoding: { isVideoDirect: true } }], false)).toEqual([]);
  });

  it("fails a DirectStream confirmation the server re-encodes", () => {
    const failures = checkSessionAgreement("DirectStream", [{ playMethod: "Transcode", transcoding: { isVideoDirect: false, isAudioDirect: true } }], true);
    expect(failures).toEqual(["method: /Sessions TranscodingInfo (IsVideoDirect=false IsAudioDirect=true) means Transcode, plan DirectStream"]);
  });

  it("fails a Transcode confirmation the server only copies", () => {
    const failures = checkSessionAgreement("Transcode", [copied], true);
    expect(failures).toEqual(["method: /Sessions TranscodingInfo (IsVideoDirect=true IsAudioDirect=true) means DirectStream, plan Transcode"]);
  });

  it("fails a reported PlayMethod other than Transcode", () => {
    expect(checkSessionAgreement("Transcode", [{ ...encoded, playMethod: "DirectPlay" }], true)).toEqual(["method: /Sessions PlayMethod DirectPlay, reports must stay Transcode"]);
    expect(checkSessionAgreement("DirectStream", [{ ...copied, playMethod: "DirectStream" }], true)).toEqual(["method: /Sessions PlayMethod DirectStream, reports must stay Transcode"]);
  });

  it("keeps TranscodingInfo on /Sessions after the confirmation was reported", () => {
    const observations = [
      { at: 1000, playMethod: "Transcode", transcoding: { isVideoDirect: true, isAudioDirect: true } },
      { at: 5000, playMethod: "Transcode", transcoding: { isVideoDirect: true, isAudioDirect: true } },
    ];
    expect(checkSessionAgreement("DirectStream", observations, true, 5000)).toEqual([]);
    expect(checkSessionAgreement("DirectStream", observations, true, 6000)).toEqual(["oracle: /Sessions never showed this playback after the confirmed method was reported"]);
    // The server dropped the job once the app reported something else.
    expect(checkSessionAgreement("DirectStream", [observations[0], { at: 5000, playMethod: "Transcode" }], true, 5000)).toEqual(["method: /Sessions lost TranscodingInfo after the confirmed method was reported"]);
  });

  it("is blind without TranscodingInfo", () => {
    expect(checkSessionAgreement("Transcode", [{ playMethod: "Transcode" }], true)).toEqual(["oracle: /Sessions never showed TranscodingInfo for this conversion"]);
  });
});

describe("checkJobGone", () => {
  it("passes when no job remains at the deadline and reports when it went away", () => {
    const result = checkJobGone([
      { msAfterStop: 0, ffmpegProcesses: 1, sessionsWithTranscodingInfo: 1 },
      { msAfterStop: 1500, ffmpegProcesses: 0, sessionsWithTranscodingInfo: 0 },
      { msAfterStop: 10_050, ffmpegProcesses: 0, sessionsWithTranscodingInfo: 0 },
    ], 10_000);
    expect(result).toEqual({ failures: [], goneAfterMs: 1500 });
  });

  it("fails a leftover ffmpeg process or TranscodingInfo", () => {
    const leftover = checkJobGone([
      { msAfterStop: 0, ffmpegProcesses: 0, sessionsWithTranscodingInfo: 0 },
      { msAfterStop: 10_020, ffmpegProcesses: 1, sessionsWithTranscodingInfo: 1 },
    ], 10_000);
    expect(leftover.failures).toEqual([
      "I1: 1 ffmpeg process(es) 10 s after the stopped report",
      "I1: TranscodingInfo still on /Sessions 10 s after the stopped report",
    ]);
    expect(leftover.goneAfterMs).toBeUndefined();
  });

  it("is blind without an observation at the deadline", () => {
    expect(checkJobGone([{ msAfterStop: 9000, ffmpegProcesses: 0, sessionsWithTranscodingInfo: 0 }], 10_000).failures[0]).toMatch(/^oracle/);
  });
});
