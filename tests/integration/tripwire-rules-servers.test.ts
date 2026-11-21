// T2-09 frozen tests for the per-server tripwire rules (tripwire-rules.ts). Docker-free.
// Signatures chosen here (the implementer follows them):
//   checkHlsRequest(rawUrl, serverUrl, server: "jellyfin" | "jellyscale" = "jellyfin")
//   findForbiddenRenditions(masterBody): string[]   (offending playlist lines; [] when clean)
//   checkClientConversion({ delivery, playMethod, clientReason, chip, requests }): string[]
//     requests is the row's slice of the wire record (any methods, any items); the rule picks out
//     POST /Items/{id}/PlaybackInfo itself.
//   checkPrecondition(precondition, { credentialNames, listedItemPaths, samplePath }): string[]
//   jobSignals("jellyfin", { ffmpegProcesses, sessionsWithJob, transcodeLogLines, transcodeLogFiles }): string[]
//   jobSignals("jellyscale", { newJobRows, sessionsWithJob, transcodeFfmpegProcesses }): string[]
//     both return the names of the signals that fired.
//   classifyJellyscaleFfmpeg(commandLine): "transcode" | "other"
import { describe, expect, it } from "vitest";
import {
  checkClientConversion,
  checkHlsRequest,
  checkMediaRequest,
  checkPrecondition,
  classifyJellyscaleFfmpeg,
  findForbiddenRenditions,
  jobSignals,
} from "./tripwire-rules";
import type { WireRecord } from "./tripwire-wire";

const base = "http://127.0.0.1:18098";

describe("T2-09 item 2: only original-file requests, no credential parameter", () => {
  it("checkMediaRequest refuses a credential parameter on a stream and a subtitle URL", () => {
    for (const name of ["api_key", "ApiKey", "apikey", "access_token", "ACCESS_TOKEN", "Token"]) {
      const stream = checkMediaRequest(`${base}/Videos/abc/stream?Static=true&${name}=t`);
      expect(stream.ok, `stream ${name}`).toBe(false);
      expect(stream.reason, `stream ${name}`).toBeTruthy();
      const subtitle = checkMediaRequest(`${base}/Videos/abc/def/Subtitles/2/0/Stream.vtt?${name}=t`);
      expect(subtitle.ok, `subtitle ${name}`).toBe(false);
      expect(subtitle.reason, `subtitle ${name}`).toBeTruthy();
    }
  });

  it("checkMediaRequest still accepts a credential-free stream and subtitle", () => {
    expect(checkMediaRequest(`${base}/Videos/abc/stream?Static=true&MediaSourceId=abc`)).toEqual({ ok: true, kind: "stream" });
    expect(checkMediaRequest(`${base}/Videos/abc/def/Subtitles/2/0/Stream.vtt`)).toEqual({ ok: true, kind: "subtitle" });
  });

  it("jobSignals on Jellyfin reports each signal alone and none when every count is zero", () => {
    const zero = { ffmpegProcesses: 0, sessionsWithJob: 0, transcodeLogLines: 0, transcodeLogFiles: 0 };
    expect(jobSignals("jellyfin", zero)).toEqual([]);
    expect(jobSignals("jellyfin", { ...zero, ffmpegProcesses: 1 })).toEqual(["ffmpeg"]);
    expect(jobSignals("jellyfin", { ...zero, sessionsWithJob: 1 })).toEqual(["sessions"]);
    expect(jobSignals("jellyfin", { ...zero, transcodeLogLines: 2 })).toEqual(["log"]);
    expect(jobSignals("jellyfin", { ...zero, transcodeLogFiles: 1 })).toEqual(["log"]);
  });

  it("jobSignals on Jellyscale reports each signal alone and none when every count is zero", () => {
    const zero = { newJobRows: 0, sessionsWithJob: 0, transcodeFfmpegProcesses: 0 };
    expect(jobSignals("jellyscale", zero)).toEqual([]);
    expect(jobSignals("jellyscale", { ...zero, newJobRows: 1 })).toEqual(["job-rows"]);
    expect(jobSignals("jellyscale", { ...zero, sessionsWithJob: 1 })).toEqual(["sessions"]);
    expect(jobSignals("jellyscale", { ...zero, transcodeFfmpegProcesses: 1 })).toEqual(["ffmpeg"]);
  });

  it("jobSignals on Jellyscale ignores the Jellyfin log counts, which that server has no oracle for", () => {
    const counts = { newJobRows: 0, sessionsWithJob: 0, transcodeFfmpegProcesses: 0, transcodeLogLines: 3, transcodeLogFiles: 3, ffmpegProcesses: 3 };
    expect(jobSignals("jellyscale", counts)).toEqual([]);
  });

  it("classifyJellyscaleFfmpeg counts a command it does not recognise as a transcode", () => {
    expect(classifyJellyscaleFfmpeg("ffmpeg -i in.mkv -weird-unknown-flag out")).toBe("transcode");
    expect(classifyJellyscaleFfmpeg("/usr/bin/ffmpeg --never-seen-before")).toBe("transcode");
  });
});

const CHIP = "Converting on server: this device cannot play the original";

function post(overrides: Partial<WireRecord> = {}): WireRecord {
  return {
    method: "POST",
    origin: base,
    path: "/Items/abc/PlaybackInfo",
    queryNames: ["EnableDirectPlay", "AllowVideoStreamCopy"],
    queryPairs: [["EnableDirectPlay", "false"], ["AllowVideoStreamCopy", "false"]],
    flags: { EnableDirectPlay: false, AllowVideoStreamCopy: false },
    hasAuthorization: true,
    scheme: "MediaBrowser",
    hasToken: true,
    urlHoldsSecret: false,
    redirectMode: "manual",
    status: 200,
    ...overrides,
  };
}

function firstPost(): WireRecord {
  return post({
    queryNames: [],
    queryPairs: [],
    flags: { EnableDirectPlay: true, EnableDirectStream: true, AllowVideoStreamCopy: true },
  });
}

function goodConversion() {
  return {
    delivery: "hls" as const,
    playMethod: "Transcode",
    clientReason: "DeviceCannotPlay" as string | undefined,
    chip: CHIP,
    requests: [
      { ...firstPost(), method: "GET", path: "/Items" } as WireRecord,
      firstPost(),
      post(),
      { ...post(), method: "GET", path: "/videos/abc/master.m3u8", queryPairs: undefined, flags: undefined } as WireRecord,
    ],
  };
}

describe("T2-09 item 3: checkClientConversion", () => {
  it("passes a plan with the reason, the owner's chip and two PlaybackInfo requests with both flags false", () => {
    expect(checkClientConversion(goodConversion())).toEqual([]);
  });

  it("fails when the client reason is missing or different", () => {
    expect(checkClientConversion({ ...goodConversion(), clientReason: undefined }).length).toBeGreaterThan(0);
    expect(checkClientConversion({ ...goodConversion(), clientReason: "ContainerBitrateExceedsLimit" }).length).toBeGreaterThan(0);
  });

  it("fails when the chip text differs from the owner's", () => {
    expect(checkClientConversion({ ...goodConversion(), chip: "Converting on server: the server needs to convert this file" }).length).toBeGreaterThan(0);
    expect(checkClientConversion({ ...goodConversion(), chip: CHIP + "." }).length).toBeGreaterThan(0);
  });

  it("fails when the plan is not an HLS Transcode", () => {
    expect(checkClientConversion({ ...goodConversion(), delivery: "static" as never }).length).toBeGreaterThan(0);
    expect(checkClientConversion({ ...goodConversion(), playMethod: "DirectStream" }).length).toBeGreaterThan(0);
  });

  it("fails when the second request's flags differ between the body and the query", () => {
    const bodyTrue = { ...goodConversion(), requests: [firstPost(), post({ flags: { EnableDirectPlay: false, AllowVideoStreamCopy: true } })] };
    expect(checkClientConversion(bodyTrue).length).toBeGreaterThan(0);
    const queryTrue = { ...goodConversion(), requests: [firstPost(), post({ queryPairs: [["EnableDirectPlay", "false"], ["AllowVideoStreamCopy", "true"]] })] };
    expect(checkClientConversion(queryTrue).length).toBeGreaterThan(0);
    const queryMissing = { ...goodConversion(), requests: [firstPost(), post({ queryPairs: [] })] };
    expect(checkClientConversion(queryMissing).length).toBeGreaterThan(0);
  });

  it("fails when the second request leaves a flag true in both places", () => {
    const stillTrue = {
      ...goodConversion(),
      requests: [firstPost(), post({ queryPairs: [["EnableDirectPlay", "true"], ["AllowVideoStreamCopy", "false"]], flags: { EnableDirectPlay: true, AllowVideoStreamCopy: false } })],
    };
    expect(checkClientConversion(stillTrue).length).toBeGreaterThan(0);
  });

  it("fails when the PlaybackInfo count is not two", () => {
    expect(checkClientConversion({ ...goodConversion(), requests: [firstPost()] }).length).toBeGreaterThan(0);
    expect(checkClientConversion({ ...goodConversion(), requests: [firstPost(), post(), post()] }).length).toBeGreaterThan(0);
    expect(checkClientConversion({ ...goodConversion(), requests: [] }).length).toBeGreaterThan(0);
  });
});

describe("T2-09 item 5: checkPrecondition", () => {
  const sample = "/media/movies/Synthetic ISO (2024)/Synthetic ISO (2024).iso";

  it("no-restricted-credentials holds when no restricted Jellyscale credential exists", () => {
    const facts = { credentialNames: ["jellyscale_url", "jellyscale_username", "jellyscale_password", "jellyfin-12_restricted_username"], listedItemPaths: [], samplePath: sample };
    expect(checkPrecondition("no-restricted-credentials", facts)).toEqual([]);
  });

  it("fails no-restricted-credentials when jellyscale_restricted_username appears", () => {
    const facts = { credentialNames: ["jellyscale_url", "jellyscale_restricted_username"], listedItemPaths: [], samplePath: sample };
    expect(checkPrecondition("no-restricted-credentials", facts).length).toBeGreaterThan(0);
  });

  it("not-listed holds when the server lists no item for the sample", () => {
    const facts = { credentialNames: [], listedItemPaths: ["Synthetic H264 (2024)/Synthetic H264 (2024).mkv", "00000.m2ts"], samplePath: sample };
    expect(checkPrecondition("not-listed", facts)).toEqual([]);
  });

  it("fails not-listed when Jellyscale starts listing the ISO", () => {
    const facts = { credentialNames: [], listedItemPaths: ["Synthetic ISO (2024)/Synthetic ISO (2024).iso"], samplePath: sample };
    expect(checkPrecondition("not-listed", facts).length).toBeGreaterThan(0);
  });

  it("fails a precondition it does not know", () => {
    expect(checkPrecondition("no-such-precondition" as never, { credentialNames: [], listedItemPaths: [], samplePath: sample }).length).toBeGreaterThan(0);
  });
});

describe("T2-09 item 1: checkHlsRequest per server kind and findForbiddenRenditions", () => {
  const master = `${base}/videos/abc/master.m3u8?MediaSourceId=abc&EnableTrickplay=false`;
  const variantBare = `${base}/videos/abc/main.m3u8?MediaSourceId=abc`;
  const initBare = `${base}/videos/abc/hls1/main/-1.mp4?MediaSourceId=abc`;
  const segmentBare = `${base}/videos/abc/hls1/main/3.mp4?MediaSourceId=abc`;

  it("a master with EnableTrickplay=false passes for both kinds", () => {
    expect(checkHlsRequest(master, base, "jellyfin")).toMatchObject({ ok: true, kind: "master" });
    expect(checkHlsRequest(master, base, "jellyscale")).toMatchObject({ ok: true, kind: "master" });
  });

  it("a master without EnableTrickplay fails for both kinds", () => {
    const bare = `${base}/videos/abc/master.m3u8?MediaSourceId=abc`;
    expect(checkHlsRequest(bare, base, "jellyfin").ok).toBe(false);
    expect(checkHlsRequest(bare, base, "jellyscale").ok).toBe(false);
  });

  it("a server-written variant, init segment and segment without EnableTrickplay pass for jellyscale", () => {
    expect(checkHlsRequest(variantBare, base, "jellyscale")).toMatchObject({ ok: true, kind: "variant" });
    expect(checkHlsRequest(initBare, base, "jellyscale")).toMatchObject({ ok: true, kind: "segment" });
    expect(checkHlsRequest(segmentBare, base, "jellyscale")).toMatchObject({ ok: true, kind: "segment" });
  });

  it("the same URLs fail for jellyfin, and fail by default", () => {
    for (const url of [variantBare, initBare, segmentBare]) {
      expect(checkHlsRequest(url, base, "jellyfin").ok, url).toBe(false);
      expect(checkHlsRequest(url, base).ok, url).toBe(false);
    }
  });

  it("jellyscale still refuses a credential, a Static parameter, another origin and a wrong path", () => {
    expect(checkHlsRequest(`${variantBare}&ApiKey=t`, base, "jellyscale").ok).toBe(false);
    expect(checkHlsRequest(`${initBare}&api_key=t`, base, "jellyscale").ok).toBe(false);
    expect(checkHlsRequest(`${segmentBare}&Static=true`, base, "jellyscale").ok).toBe(false);
    expect(checkHlsRequest(`http://127.0.0.1:9/videos/abc/hls1/main/3.mp4`, base, "jellyscale").ok).toBe(false);
    expect(checkHlsRequest(`${base}/Videos/abc/stream?Static=true`, base, "jellyscale").ok).toBe(false);
  });

  it("jellyscale still refuses EnableTrickplay=true where it is present", () => {
    expect(checkHlsRequest(`${variantBare}&EnableTrickplay=true`, base, "jellyscale").ok).toBe(false);
  });

  it("findForbiddenRenditions names subtitle renditions and image streams, not audio", () => {
    const clean = ["#EXTM3U", '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="en",URI="audio.m3u8"', "#EXT-X-STREAM-INF:BANDWIDTH=1000,AUDIO=\"a\"", "main.m3u8"].join("\n");
    expect(findForbiddenRenditions(clean)).toEqual([]);
    const subtitles = '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="s",NAME="en",URI="sub.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8';
    expect(findForbiddenRenditions(subtitles)).toHaveLength(1);
    const trickplay = '#EXTM3U\n#EXT-X-IMAGE-STREAM-INF:BANDWIDTH=1,RESOLUTION=320x180,URI="tiles.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8';
    expect(findForbiddenRenditions(trickplay)).toHaveLength(1);
    const both = `${subtitles}\n#EXT-X-IMAGE-STREAM-INF:BANDWIDTH=1,URI="t.m3u8"`;
    expect(findForbiddenRenditions(both)).toHaveLength(2);
  });

  it("findForbiddenRenditions reads the tag name and type case-sensitively as HLS spells them, with attribute order free", () => {
    const reordered = '#EXTM3U\n#EXT-X-MEDIA:URI="sub.m3u8",NAME="en",TYPE=SUBTITLES,GROUP-ID="s"';
    expect(findForbiddenRenditions(reordered)).toHaveLength(1);
    const quoted = '#EXTM3U\n#EXT-X-MEDIA:TYPE="SUBTITLES",GROUP-ID="s",URI="sub.m3u8"';
    expect(findForbiddenRenditions(quoted)).toHaveLength(1);
  });
});
