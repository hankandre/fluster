import { describe, expect, it } from "vitest";
import { checkMediaRequest, classifyProcess, decideStatus, findTranscodeLogFiles, findTranscodeLogLines, findTranscodingSessions } from "./tripwire-rules";

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
  const played = { failures: [], streamRequests: 2 };

  it("passes a clean playback", () => {
    expect(decideStatus(played)).toEqual({ status: "PASS" });
  });

  it("fails on any recorded failure", () => {
    expect(decideStatus({ ...played, failures: ["I1: ffmpeg process"] }).status).toBe("FAIL");
    expect(decideStatus({ ...played, failures: ["oracle: docker exec failed"] }).status).toBe("FAIL");
  });

  it("fails an unexpected refusal", () => {
    const result = decideStatus({ failures: [], streamRequests: 0, refusal: "no-direct-play" });
    expect(result.status).toBe("FAIL");
    expect(result.extraFailure).toContain("no-direct-play");
  });

  it("accepts only the declared refusal reason with no stream request", () => {
    expect(decideStatus({ failures: [], streamRequests: 0, refusal: "disc-source", expectRefused: "disc-source" })).toEqual({ status: "EXPECTED-REFUSED" });
    expect(decideStatus({ failures: [], streamRequests: 0, refusal: "iso-source", expectRefused: "disc-source" }).status).toBe("FAIL");
    expect(decideStatus({ failures: [], streamRequests: 1, refusal: "disc-source", expectRefused: "disc-source" }).status).toBe("FAIL");
  });

  it("fails when an expected refusal does not happen", () => {
    const result = decideStatus({ ...played, expectRefused: "disc-source" });
    expect(result.status).toBe("FAIL");
    expect(result.extraFailure).toContain("disc-source");
  });

  it("still fails an expected refusal that had other failures", () => {
    expect(decideStatus({ failures: ["I1: ffmpeg"], streamRequests: 0, refusal: "disc-source", expectRefused: "disc-source" }).status).toBe("FAIL");
  });
});
